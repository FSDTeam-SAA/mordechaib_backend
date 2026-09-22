import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthTokensRepository } from './auth-tokens.repository';
import { AuthController } from './auth.controller';
import { AuthProfileController } from './auth-profile.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { ProfileAvatarStorageService } from './profile-avatar-storage.service';
import { AccountDeletionService } from './account-deletion.service';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [
    ConfigModule,
    OrganizationsModule,
    AuditLogsModule,
    StripeModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.accessSecret'),
      }),
    }),
  ],
  controllers: [AuthController, AuthProfileController],
  providers: [
    AuthService,
    AuthRepository,
    AuthSessionsRepository,
    AuthTokensRepository,
    JwtStrategy,
    ProfileAvatarStorageService,
    AccountDeletionService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
