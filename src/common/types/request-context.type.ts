import { UserRole } from '../enums/user-role.enum';

export type RequestUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  role: UserRole;
  sessionId: string;
};

export type RequestOrganization = {
  id: string;
};
