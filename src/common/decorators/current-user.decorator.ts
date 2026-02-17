import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { OrganizationRole, OrganizationType, SystemRole } from '@prisma/client';

export type CurrentUserShape = {
  userId: string;
  email: string;
  systemRole: SystemRole;
  isEmailVerified: boolean;
  organizationId?: string;
  organizationRole?: OrganizationRole;
  organizationType?: OrganizationType;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserShape | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: CurrentUserShape }>();
    return request.user;
  },
);
