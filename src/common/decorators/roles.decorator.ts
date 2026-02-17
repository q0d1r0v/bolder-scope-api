import { SetMetadata } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: OrganizationRole[]) => SetMetadata(ROLES_KEY, roles);
