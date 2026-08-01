import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '../../common/enums/user-status.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AuthRepository } from './auth.repository';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { JwtPayload } from '../../common/types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly authRepository: AuthRepository,
    private readonly sessionsRepository: AuthSessionsRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    const [session, user] = await Promise.all([
      this.sessionsRepository.findActiveById(payload.sessionId),
      this.authRepository.findById(payload.sub),
    ]);

    if (
      !session ||
      !user ||
      session.userId !== String(user._id) ||
      user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    return {
      id: String(user._id),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      organizationId: user.organizationId,
      role: user.role,
      sessionId: payload.sessionId,
    };
  }
}
