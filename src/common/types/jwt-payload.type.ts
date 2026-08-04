import { UserRole } from '../enums/user-role.enum';

export type JwtPayload = {
  sub: string;
  email: string;
  organizationId: string;
  role: UserRole;
  sessionId: string;
  tokenType: 'access';
  isPlatformAdmin: boolean;
};