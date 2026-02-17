import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationRole, SystemRole } from '@prisma/client';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';
import { CurrentUserShape } from '@/common/decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OrganizationRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: CurrentUserShape }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    if (user.systemRole === SystemRole.SUPER_ADMIN) {
      return true;
    }

    if (!user.organizationRole || !requiredRoles.includes(user.organizationRole)) {
      throw new ForbiddenException('You do not have the required role to access this resource');
    }

    return true;
  }
}
