import { UserRole } from '../../../common/enums/user-role.enum';

export type JwtPayload = {
  sub: string;
  email: string;
  organizationId: string;
  role: UserRole;
  sessionId: string;
  tokenType: 'access';
};
