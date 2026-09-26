import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AuthTokenType } from '../../common/enums/auth-token-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { sendEmail } from '../../common/helpers/mailer.helper';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthTokensRepository } from './auth-tokens.repository';
import { ProfileAvatarStorageService } from './profile-avatar-storage.service';
import { AccountDeletionService } from './account-deletion.service';

jest.mock('../../common/helpers/mailer.helper', () => ({
  sendEmail: jest.fn(),
}));

describe('AuthService email verification', () => {
  const userId = '507f1f77bcf86cd799439011';
  const organizationId = '507f1f77bcf86cd799439012';
  const email = 'owner@example.com';
  const updatedAt = new Date('2026-09-19T10:30:00.000Z');
  let repository: Record<string, jest.Mock>;
  let sessions: Record<string, jest.Mock>;
  let tokens: Record<string, jest.Mock>;
  let organizations: Record<string, jest.Mock>;
  let auditLogs: Record<string, jest.Mock>;
  let profileAvatarStorage: Record<string, jest.Mock>;
  let accountDeletion: Record<string, jest.Mock>;
  let jwtService: Record<string, jest.Mock>;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    (sendEmail as jest.Mock).mockResolvedValue(true);
    repository = {
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      findById: jest.fn(),
      updatePassword: jest.fn(),
      create: jest.fn(),
      markEmailVerified: jest.fn(),
      updateLastLogin: jest.fn(),
      updateProfile: jest.fn(),
    };
    sessions = {
      create: jest.fn(),
      findByRefreshTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    tokens = {
      invalidateActive: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
      consumeForUser: jest.fn(),
      consume: jest.fn(),
    };
    organizations = {
      createPendingOrganization: jest
        .fn()
        .mockResolvedValue({ _id: organizationId, name: 'Test Org' }),
      deleteOrganization: jest.fn(),
    };
    auditLogs = { create: jest.fn().mockResolvedValue(undefined) };
    profileAvatarStorage = { upload: jest.fn() };
    accountDeletion = { deleteOrganizationWorkspace: jest.fn() };
    jwtService = { signAsync: jest.fn() };
    const configValues: Record<string, unknown> = {
      'jwt.accessExpiresIn': '15m',
      'auth.refreshExpiresIn': '7d',
      'auth.rememberMeRefreshExpiresIn': '30d',
      'auth.passwordResetExpiresIn': '1h',
      'auth.passwordResetGrantExpiresIn': '15m',
      'auth.emailVerificationExpiresIn': '10m',
      'auth.bcryptRounds': 10,
      'auth.exposeDevelopmentTokens': true,
    };
    service = new AuthService(
      repository as unknown as AuthRepository,
      sessions as unknown as AuthSessionsRepository,
      tokens as unknown as AuthTokensRepository,
      organizations as unknown as OrganizationsService,
      auditLogs as unknown as AuditLogsService,
      jwtService as unknown as JwtService,
      {
        getOrThrow: jest.fn((key: string) => configValues[key]),
      } as unknown as ConfigService,
      profileAvatarStorage as unknown as ProfileAvatarStorageService,
      accountDeletion as unknown as AccountDeletionService,
    );
  });

  it('issues tokens at registration but requires email verification before access', async () => {
    repository.findByEmail.mockResolvedValue(null);
    repository.create.mockImplementation((input) =>
      Promise.resolve(user({ ...input, emailVerifiedAt: undefined })),
    );
    sessions.create.mockResolvedValue({
      _id: 'session-1',
      expiresAt: new Date('2026-09-26T10:00:00.000Z'),
    });
    jwtService.signAsync.mockResolvedValue('access-token');

    const result = await service.register({
      firstName: 'Rifat',
      lastName: 'Hossain',
      email,
      password: 'Password1!',
      acceptTerms: true,
      rememberMe: false,
    });

    expect(result).toEqual(
      expect.objectContaining({
        requiresEmailVerification: true,
        emailVerificationSent: true,
        emailVerificationCode: expect.stringMatching(/^\d{6}$/),
        accessToken: 'access-token',
        refreshToken: expect.any(String),
      }),
    );
    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId, rememberMe: false }),
    );
    expect(tokens.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        type: AuthTokenType.EMAIL_VERIFICATION,
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        to: email,
        subject: expect.stringContaining(result.emailVerificationCode!),
      }),
    );
  });

  it('blocks login until the email is verified', async () => {
    repository.findByEmailWithPassword.mockResolvedValue(
      user({ passwordHash: await bcrypt.hash('Password1!', 4) }),
    );

    await expect(
      service.login(
        { email, password: 'Password1!', rememberMe: false },
        { ipAddress: '127.0.0.1' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.updateLastLogin).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('verifies a code only for the matching email user', async () => {
    const unverified = user();
    const verified = user({ emailVerifiedAt: new Date() });
    repository.findByEmail.mockResolvedValue(unverified);
    tokens.consumeForUser.mockResolvedValue({ userId });
    repository.markEmailVerified.mockResolvedValue(verified);

    await expect(service.verifyEmail(email, '123456')).resolves.toEqual(
      expect.objectContaining({
        message: 'Email verified successfully',
        user: expect.objectContaining({ emailVerified: true }),
      }),
    );
    expect(tokens.consumeForUser).toHaveBeenCalledWith(
      userId,
      createHash('sha256').update(`${userId}:123456`).digest('hex'),
      AuthTokenType.EMAIL_VERIFICATION,
    );
  });

  it('rejects an invalid or expired verification code', async () => {
    repository.findByEmail.mockResolvedValue(user());
    tokens.consumeForUser.mockResolvedValue(null);

    await expect(service.verifyEmail(email, '123456')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('issues a short-lived reset token after verifying the matching OTP', async () => {
    repository.findByEmail.mockResolvedValue(user());
    tokens.consumeForUser.mockResolvedValue({ userId });

    const result = await service.verifyPasswordResetOtp(email, '123456');

    expect(tokens.consumeForUser).toHaveBeenCalledWith(
      userId,
      createHash('sha256').update('123456').digest('hex'),
      AuthTokenType.PASSWORD_RESET,
    );
    expect(tokens.invalidateActive).toHaveBeenCalledWith(
      userId,
      AuthTokenType.PASSWORD_RESET_VERIFIED,
    );
    expect(tokens.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        type: AuthTokenType.PASSWORD_RESET_VERIFIED,
        tokenHash: createHash('sha256').update(result.resetToken).digest('hex'),
        expiresAt: expect.any(Date),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        resetToken: expect.any(String),
        expiresIn: 15 * 60,
      }),
    );
  });

  it('resets the password with a verified reset token and no OTP in the body', async () => {
    tokens.consume.mockResolvedValue({ userId });
    repository.findById.mockResolvedValue(user());
    repository.updatePassword.mockResolvedValue(user());

    await expect(
      service.resetPassword('verified-reset-token', {
        newPassword: 'NewPassword1!',
      }),
    ).resolves.toEqual({ message: 'Password reset successfully' });

    expect(tokens.consume).toHaveBeenCalledWith(
      createHash('sha256')
        .update('verified-reset-token')
        .digest('hex'),
      AuthTokenType.PASSWORD_RESET_VERIFIED,
    );
    expect(repository.updatePassword).toHaveBeenCalledWith(
      userId,
      expect.any(String),
    );
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(
      userId,
      'PASSWORD_RESET',
    );
  });

  it('stores an uploaded avatar URL on the profile', async () => {
    const avatarUrl = 'https://res.cloudinary.com/demo/image/upload/avatar';
    const uploadedAvatar = {
      buffer: Buffer.from('image-data'),
      mimetype: 'image/png',
    } as Express.Multer.File;
    profileAvatarStorage.upload.mockResolvedValue(avatarUrl);
    repository.findById.mockResolvedValue(user());
    repository.updateProfile.mockResolvedValue(user({ avatarUrl }));

    await expect(
      service.updateProfile(
        userId,
        { expectedUpdatedAt: updatedAt.toISOString() },
        uploadedAvatar,
      ),
    ).resolves.toEqual(expect.objectContaining({ avatarUrl }));

    expect(profileAvatarStorage.upload).toHaveBeenCalledWith(
      userId,
      uploadedAvatar,
    );
    expect(repository.updateProfile).toHaveBeenCalledWith(
      userId,
      {
        set: { avatarUrl },
        unset: {},
      },
      updatedAt,
    );
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { fields: ['avatarUrl'] } }),
    );
  });

  it('rejects an uploaded avatar combined with avatarUrl', async () => {
    repository.findById.mockResolvedValue(user());
    await expect(
      service.updateProfile(
        userId,
        {
          expectedUpdatedAt: updatedAt.toISOString(),
          avatarUrl: 'https://example.com/avatar.png',
        },
        { buffer: Buffer.from('image-data') } as Express.Multer.File,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires the owner password before permanently deleting a workspace', async () => {
    repository.findByIdWithPassword = jest
      .fn()
      .mockResolvedValue(
        user({ passwordHash: await bcrypt.hash('Password1!', 4) }),
      );
    accountDeletion.deleteOrganizationWorkspace.mockResolvedValue({
      deleted: true,
    });

    await expect(
      service.deleteAccount(userId, {
        password: 'Password1!',
        confirmation: 'DELETE',
      }),
    ).resolves.toEqual({
      message: 'Account and organization data deleted permanently',
      deleted: true,
    });
    expect(accountDeletion.deleteOrganizationWorkspace).toHaveBeenCalledWith({
      organizationId,
      ownerUserId: userId,
    });
  });

  function user(overrides: Record<string, unknown> = {}) {
    return {
      _id: userId,
      organizationId,
      firstName: 'Rifat',
      lastName: 'Hossain',
      email,
      role: UserRole.OWNER,
      status: UserStatus.ACTIVE,
      isPlatformAdmin: false,
      language: 'en',
      updatedAt,
      ...overrides,
    };
  }
});
