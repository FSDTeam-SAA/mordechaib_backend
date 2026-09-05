import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import { AuthTokenType } from '../../common/enums/auth-token-type.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { parseDurationToSeconds } from '../../common/helpers/duration.helper';
import { sendEmail } from '../../common/helpers/mailer.helper';
import { assertValidTimezone } from '../../common/helpers/timezone.helper';
import { getEmailVerificationTemplate } from '../../common/templates/email-verification.template';
import { getPasswordResetTemplate } from '../../common/templates/password-reset.template';
import { UserDocument } from '../../database/schemas/user.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthTokensRepository } from './auth-tokens.repository';
import { AuthRepository } from './auth.repository';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { SessionMetadata } from '../../common/types/session-metadata.type';

@Injectable()
export class AuthService {
  private readonly accessTokenExpiresIn: number;
  private readonly refreshTokenExpiresIn: number;
  private readonly rememberMeRefreshTokenExpiresIn: number;
  private readonly passwordResetExpiresIn: number;
  private readonly emailVerificationExpiresIn: number;
  private readonly bcryptRounds: number;
  private readonly exposeDevelopmentTokens: boolean;
  private readonly frontendUrl: string;

  constructor(
    private readonly repository: AuthRepository,
    private readonly sessionsRepository: AuthSessionsRepository,
    private readonly tokensRepository: AuthTokensRepository,
    private readonly organizationsService: OrganizationsService,
    private readonly auditLogs: AuditLogsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.accessTokenExpiresIn = parseDurationToSeconds(
      config.getOrThrow<string>('jwt.accessExpiresIn'),
    );
    this.refreshTokenExpiresIn = parseDurationToSeconds(
      config.getOrThrow<string>('auth.refreshExpiresIn'),
    );
    this.rememberMeRefreshTokenExpiresIn = parseDurationToSeconds(
      config.getOrThrow<string>('auth.rememberMeRefreshExpiresIn'),
    );
    this.passwordResetExpiresIn = parseDurationToSeconds(
      config.getOrThrow<string>('auth.passwordResetExpiresIn'),
    );
    this.emailVerificationExpiresIn = parseDurationToSeconds(
      config.getOrThrow<string>('auth.emailVerificationExpiresIn'),
    );
    this.bcryptRounds = config.getOrThrow<number>('auth.bcryptRounds');
    this.exposeDevelopmentTokens = config.getOrThrow<boolean>(
      'auth.exposeDevelopmentTokens',
    );
    this.frontendUrl = config
      .getOrThrow<string>('mail.frontendUrl')
      .replace(/\/$/, '');

    if (
      !Number.isInteger(this.bcryptRounds) ||
      this.bcryptRounds < 10 ||
      this.bcryptRounds > 15
    ) {
      throw new Error('BCRYPT_ROUNDS must be an integer between 10 and 15');
    }
  }

  async register(dto: RegisterDto, metadata: SessionMetadata) {
    if (await this.repository.findByEmail(dto.email)) {
      throw new ConflictException('An account with this email already exists');
    }

    const organization =
      await this.organizationsService.createPendingOrganization(
        `${dto.firstName} ${dto.lastName}`,
      );

    let user: UserDocument;
    try {
      user = await this.repository.create({
        organizationId: String(organization._id),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, this.bcryptRounds),
        termsAcceptedAt: new Date(),
      });
    } catch (error: unknown) {
      await this.organizationsService.deleteOrganization(
        String(organization._id),
      );
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }

    const [session, emailVerificationToken] = await Promise.all([
      this.issueSession(user, dto.rememberMe, metadata),
      this.issueOneTimeToken(
        String(user._id),
        AuthTokenType.EMAIL_VERIFICATION,
        this.emailVerificationExpiresIn,
      ),
    ]);
    const emailVerificationTemplate = this.getEmailVerificationTemplate(
      emailVerificationToken,
    );
    const emailVerificationSent = await sendEmail(this.config, {
      to: user.email,
      ...emailVerificationTemplate,
    });

    return {
      user: this.toUserResponse(user),
      organization,
      ...session,
      emailVerificationSent,
      ...(this.exposeDevelopmentTokens ? { emailVerificationToken } : {}),
    };
  }

  async login(dto: LoginDto, metadata: SessionMetadata) {
    const user = await this.repository.findByEmailWithPassword(dto.email);
    if (!user) {
      await bcrypt.hash(dto.password, this.bcryptRounds);
      throw new UnauthorizedException('Invalid email or password');
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.repository.updateLastLogin(String(user._id));
    const session = await this.issueSession(user, dto.rememberMe, metadata);
    return { user: this.toUserResponse(user), ...session };
  }

  async refresh(refreshToken: string, metadata: SessionMetadata) {
    const session = await this.sessionsRepository.findByRefreshTokenHash(
      this.hashToken(refreshToken),
    );
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    if (session.revokedAt) {
      await this.sessionsRepository.revokeFamily(
        session.familyId,
        'REFRESH_TOKEN_REUSE',
      );
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessionsRepository.revoke(String(session._id), 'EXPIRED');
      throw new UnauthorizedException('Refresh token has expired');
    }

    const claimedSession = await this.sessionsRepository.revoke(
      String(session._id),
      'ROTATED',
    );
    if (!claimedSession) {
      await this.sessionsRepository.revokeFamily(
        session.familyId,
        'REFRESH_TOKEN_REUSE',
      );
      throw new UnauthorizedException('Refresh token has already been used');
    }

    const user = await this.repository.findById(session.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is unavailable');
    }

    return this.issueSession(
      user,
      session.rememberMe,
      metadata,
      session.familyId,
    );
  }

  async logout(sessionId: string) {
    await this.sessionsRepository.revoke(sessionId, 'LOGOUT');
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string) {
    await this.sessionsRepository.revokeAllForUser(userId, 'LOGOUT_ALL');
    return { message: 'All sessions have been revoked' };
  }

  async getMe(userId: string) {
    const user = await this.repository.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.toUserResponse(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};

    if (dto.firstName !== undefined) set.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) set.lastName = dto.lastName.trim();

    const optionalFields = [
      'phoneNumber',
      'timezone',
      'language',
      'avatarUrl',
    ] as const;
    for (const field of optionalFields) {
      const value = dto[field];
      if (value === undefined) continue;
      if (value === null) {
        unset[field] = '';
      } else {
        set[field] = value;
      }
    }

    if (typeof dto.timezone === 'string') {
      assertValidTimezone(dto.timezone);
    }

    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
      throw new BadRequestException('No profile changes were provided');
    }

    const user = await this.repository.updateProfile(userId, {
      set,
      unset,
    });
    if (!user) throw new NotFoundException('User not found');

    await this.auditLogs.create({
      organizationId: user.organizationId,
      userId,
      action: 'USER_PROFILE_UPDATED',
      resourceType: 'User',
      resourceId: userId,
      metadata: { fields: [...Object.keys(set), ...Object.keys(unset)] },
    });

    return this.toUserResponse(user);
  }

  async forgotPassword(email: string) {
    const user = await this.repository.findByEmail(email);
    let passwordResetCode: string | undefined;

    if (user && user.status === UserStatus.ACTIVE) {
      passwordResetCode = await this.issueOneTimeToken(
        String(user._id),
        AuthTokenType.PASSWORD_RESET,
        this.passwordResetExpiresIn,
      );
      const passwordResetTemplate =
        this.getPasswordResetTemplate(passwordResetCode);
      await sendEmail(this.config, {
        to: user.email,
        ...passwordResetTemplate,
      });
    }

    return {
      message:
        'If the account exists, password reset instructions have been created',
      ...(this.exposeDevelopmentTokens && passwordResetCode
        ? { passwordResetCode }
        : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const token = await this.tokensRepository.consume(
      this.hashToken(dto.code),
      AuthTokenType.PASSWORD_RESET,
    );
    if (!token)
      throw new UnauthorizedException('Invalid or expired reset token');

    const user = await this.repository.findById(token.userId);
    if (!user)
      throw new UnauthorizedException('Invalid or expired reset token');

    await this.repository.updatePassword(
      token.userId,
      await bcrypt.hash(dto.newPassword, this.bcryptRounds),
    );
    await this.sessionsRepository.revokeAllForUser(
      token.userId,
      'PASSWORD_RESET',
    );
    return { message: 'Password reset successfully' };
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.repository.findByIdWithPassword(userId);
    if (!user) return false;
    return bcrypt.compare(password, user.passwordHash);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.repository.findByIdWithPassword(userId);
    if (
      !user ||
      !(await bcrypt.compare(dto.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new ConflictException(
        'New password must be different from current password',
      );
    }

    await this.repository.updatePassword(
      userId,
      await bcrypt.hash(dto.newPassword, this.bcryptRounds),
    );
    await this.sessionsRepository.revokeAllForUser(userId, 'PASSWORD_CHANGED');
    return { message: 'Password changed successfully. Please sign in again.' };
  }

  async verifyEmail(token: string) {
    const authToken = await this.tokensRepository.consume(
      this.hashToken(token),
      AuthTokenType.EMAIL_VERIFICATION,
    );
    if (!authToken) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    const user = await this.repository.markEmailVerified(authToken.userId);
    if (!user) throw new UnauthorizedException('Invalid verification token');
    return {
      message: 'Email verified successfully',
      user: this.toUserResponse(user),
    };
  }

  async resendEmailVerification(userId: string) {
    const user = await this.repository.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerifiedAt) return { message: 'Email is already verified' };

    const emailVerificationToken = await this.issueOneTimeToken(
      userId,
      AuthTokenType.EMAIL_VERIFICATION,
      this.emailVerificationExpiresIn,
    );
    const emailVerificationTemplate = this.getEmailVerificationTemplate(
      emailVerificationToken,
    );
    const emailVerificationSent = await sendEmail(this.config, {
      to: user.email,
      ...emailVerificationTemplate,
    });
    return {
      message: 'Email verification instructions have been created',
      emailVerificationSent,
      ...(this.exposeDevelopmentTokens ? { emailVerificationToken } : {}),
    };
  }

  private async issueSession(
    user: UserDocument,
    rememberMe: boolean,
    metadata: SessionMetadata,
    familyId: string = randomUUID(),
  ) {
    const refreshToken = this.generateOpaqueToken();
    const refreshExpiresIn = rememberMe
      ? this.rememberMeRefreshTokenExpiresIn
      : this.refreshTokenExpiresIn;
    const session = await this.sessionsRepository.create({
      userId: String(user._id),
      familyId,
      refreshTokenHash: this.hashToken(refreshToken),
      rememberMe,
      expiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
      metadata,
    });

    const payload: JwtPayload = {
      sub: String(user._id),
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      sessionId: String(session._id),
      tokenType: 'access',
      isPlatformAdmin: user.isPlatformAdmin,
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.accessTokenExpiresIn,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      accessTokenExpiresIn: this.accessTokenExpiresIn,
      refreshTokenExpiresAt: session.expiresAt,
    };
  }

  private getEmailVerificationTemplate(token: string) {
    const url = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    return getEmailVerificationTemplate(url);
  }

  private getPasswordResetTemplate(token: string) {
    return getPasswordResetTemplate(token);
  }

  private async issueOneTimeToken(
    userId: string,
    type: AuthTokenType,
    expiresIn: number,
  ) {
    await this.tokensRepository.invalidateActive(userId, type);
    const token =
      type === AuthTokenType.PASSWORD_RESET
        ? randomInt(0, 1_000_000).toString().padStart(6, '0')
        : this.generateOpaqueToken();
    await this.tokensRepository.create({
      userId,
      type,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    });
    return token;
  }

  private toUserResponse(user: UserDocument) {
    return {
      id: String(user._id),
      organizationId: user.organizationId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      timezone: user.timezone,
      language: user.language || 'en',
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      isPlatformAdmin: user.isPlatformAdmin,
      emailVerified: Boolean(user.emailVerifiedAt),
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  private generateOpaqueToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
