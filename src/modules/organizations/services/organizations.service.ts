import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InviteStatus, OrganizationRole, UserStatus } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailIntegrationService } from '@/modules/integrations/email/services/email-integration.service';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import {
  buildPrismaPagination,
  paginate,
} from '@/common/helpers/pagination.helper';
import { AcceptInviteDto } from '@/modules/organizations/dto/accept-invite.dto';
import { CreateOrganizationDto } from '@/modules/organizations/dto/create-organization.dto';
import {
  InviteMemberDto,
  OrganizationInviteRole,
} from '@/modules/organizations/dto/invite-member.dto';

const scryptAsync = promisify(scryptCallback);
const PASSWORD_HASH_KEY_LENGTH = 64;

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailIntegrationService: EmailIntegrationService,
  ) {
    this.appUrl = this.configService.get<string>(
      'APP_URL',
      'http://localhost:3000',
    );
  }

  async create(payload: CreateOrganizationDto, userId: string) {
    const existing = await this.prisma.organization.findUnique({
      where: { slug: payload.slug },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Organization with this slug already exists');
    }

    const organization = await this.prisma.organization.create({
      data: {
        name: payload.name,
        slug: payload.slug,
        billingEmail: payload.billingEmail,
        memberships: {
          create: {
            userId,
            role: OrganizationRole.OWNER,
            inviteStatus: InviteStatus.ACCEPTED,
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        status: true,
        billingEmail: true,
        createdAt: true,
      },
    });

    return organization;
  }

  async findAll(userId: string, query: PaginationQueryDto) {
    const where = { userId };
    const { skip, take } = buildPrismaPagination(query);

    const [memberships, total] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where,
        select: {
          role: true,
          inviteStatus: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
        skip,
        take,
      }),
      this.prisma.organizationMember.count({ where }),
    ]);

    const data = memberships.map((m) => ({
      ...m.organization,
      role: m.role,
      inviteStatus: m.inviteStatus,
    }));

    return paginate(data, total, query);
  }

  async findOne(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
      select: {
        role: true,
        inviteStatus: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            status: true,
            billingEmail: true,
            createdAt: true,
            _count: { select: { memberships: true, projects: true } },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Organization not found');
    }

    return {
      ...membership.organization,
      role: membership.role,
      inviteStatus: membership.inviteStatus,
      memberCount: membership.organization._count.memberships,
      projectCount: membership.organization._count.projects,
    };
  }

  async getMembers(
    organizationId: string,
    userId: string,
    query: PaginationQueryDto,
  ) {
    await this.requireMembership(organizationId, userId);

    const where = { organizationId };
    const { skip, take } = buildPrismaPagination(query);

    const [members, total] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where,
        select: {
          id: true,
          role: true,
          inviteStatus: true,
          inviteEmail: true,
          joinedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              status: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
        skip,
        take,
      }),
      this.prisma.organizationMember.count({ where }),
    ]);

    return paginate(members, total, query);
  }

  async inviteMember(
    organizationId: string,
    inviterUserId: string,
    payload: InviteMemberDto,
  ) {
    const inviterMembership = await this.requireRole(
      organizationId,
      inviterUserId,
      [OrganizationRole.OWNER, OrganizationRole.ADMIN],
    );

    const email = payload.email.trim().toLowerCase();
    const orgRole = this.mapInviteRole(payload.role);

    const existingMember = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        OR: [{ user: { email } }, { inviteEmail: email }],
      },
      select: { id: true, inviteStatus: true },
    });

    if (existingMember) {
      if (existingMember.inviteStatus === InviteStatus.ACCEPTED) {
        throw new ConflictException(
          'This user is already a member of this organization',
        );
      }
      if (existingMember.inviteStatus === InviteStatus.PENDING) {
        throw new ConflictException(
          'An invite is already pending for this email',
        );
      }
    }

    const inviteToken = randomBytes(32).toString('hex');

    let existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });

    if (!existingUser) {
      existingUser = await this.prisma.user.create({
        data: {
          email,
          fullName: payload.fullName ?? email.split('@')[0],
          status: UserStatus.INVITED,
        },
        select: { id: true, status: true },
      });
    }

    const member = await this.prisma.organizationMember.create({
      data: {
        organizationId,
        userId: existingUser.id,
        role: orgRole,
        invitedById: inviterUserId,
        inviteToken,
        inviteStatus: InviteStatus.PENDING,
        inviteEmail: email,
        invitedAt: new Date(),
      },
      select: {
        id: true,
        role: true,
        inviteStatus: true,
        inviteEmail: true,
        organization: { select: { name: true } },
      },
    });

    await this.sendInviteEmailBestEffort({
      toEmail: email,
      organizationName: member.organization.name,
      organizationId,
      inviterUserId,
      inviteToken,
      role: orgRole,
      fullName: payload.fullName,
    });

    return {
      message: 'Invitation sent successfully',
      memberId: member.id,
      email,
      role: member.role,
      inviteStatus: member.inviteStatus,
    };
  }

  async acceptInvite(payload: AcceptInviteDto) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { inviteToken: payload.token },
      select: {
        id: true,
        userId: true,
        inviteStatus: true,
        inviteEmail: true,
        role: true,
        organization: {
          select: { id: true, name: true, slug: true, type: true },
        },
      },
    });

    if (!member) {
      throw new BadRequestException('Invalid or expired invite token');
    }

    if (member.inviteStatus !== InviteStatus.PENDING) {
      throw new BadRequestException(
        'This invitation has already been used or revoked',
      );
    }

    const passwordHash = await this.hashPassword(payload.password);
    const fullName = payload.fullName.trim();

    if (fullName.length < 2) {
      throw new BadRequestException(
        'Full name must contain at least 2 visible characters',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: member.userId },
        data: {
          fullName,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });

      await tx.organizationMember.update({
        where: { id: member.id },
        data: {
          inviteStatus: InviteStatus.ACCEPTED,
          inviteToken: null,
          joinedAt: new Date(),
        },
      });
    });

    return {
      message: 'Invitation accepted successfully',
      organizationId: member.organization.id,
      organizationName: member.organization.name,
      role: member.role,
    };
  }

  async revokeInvite(organizationId: string, memberId: string, userId: string) {
    await this.requireRole(organizationId, userId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);

    const member = await this.prisma.organizationMember.findFirst({
      where: {
        id: memberId,
        organizationId,
        inviteStatus: InviteStatus.PENDING,
      },
      select: { id: true },
    });

    if (!member) {
      throw new NotFoundException('Pending invite not found');
    }

    await this.prisma.organizationMember.update({
      where: { id: member.id },
      data: {
        inviteStatus: InviteStatus.REVOKED,
        inviteToken: null,
      },
    });

    return { message: 'Invitation revoked successfully' };
  }

  private mapInviteRole(role: OrganizationInviteRole): OrganizationRole {
    switch (role) {
      case OrganizationInviteRole.DEVELOPER:
        return OrganizationRole.DEVELOPER;
      case OrganizationInviteRole.CLIENT:
        return OrganizationRole.CLIENT;
      default:
        throw new BadRequestException('Invalid invite role');
    }
  }

  private async requireMembership(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true, role: true, inviteStatus: true },
    });

    if (!membership || membership.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    return membership;
  }

  private async requireRole(
    organizationId: string,
    userId: string,
    allowedRoles: OrganizationRole[],
  ) {
    const membership = await this.requireMembership(organizationId, userId);

    if (!allowedRoles.includes(membership.role)) {
      throw new ForbiddenException(
        'You do not have the required role for this action',
      );
    }

    return membership;
  }

  private async sendInviteEmailBestEffort(payload: {
    toEmail: string;
    organizationName: string;
    organizationId: string;
    inviterUserId: string;
    inviteToken: string;
    role: OrganizationRole;
    fullName?: string;
  }): Promise<void> {
    const inviteUrl = `${this.appUrl}/invite?token=${payload.inviteToken}`;
    const greeting = payload.fullName ? `Hi ${payload.fullName}` : 'Hello';
    const roleName = payload.role.toLowerCase();

    const subject = `You've been invited to join ${payload.organizationName} on Bolder Scope`;
    const text = [
      `${greeting},`,
      '',
      `You have been invited to join "${payload.organizationName}" as a ${roleName}.`,
      `Accept your invitation by opening this link: ${inviteUrl}`,
      '',
      'If you did not expect this invitation, you can safely ignore this email.',
    ].join('\n');
    const html = [
      `<p>${this.escapeHtml(greeting)},</p>`,
      `<p>You have been invited to join <strong>${this.escapeHtml(payload.organizationName)}</strong> as a <strong>${roleName}</strong>.</p>`,
      `<p>Accept your invitation by clicking <a href="${inviteUrl}">this link</a>.</p>`,
      '<p>If you did not expect this invitation, you can safely ignore this email.</p>',
    ].join('');

    await this.emailIntegrationService.sendBestEffort({
      toEmail: payload.toEmail,
      templateKey: 'ORGANIZATION_INVITE',
      subject,
      text,
      html,
      organizationId: payload.organizationId,
      userId: payload.inviterUserId,
      payload: {
        organizationName: payload.organizationName,
        inviteUrl,
        role: payload.role,
      },
    });
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(
      password,
      salt,
      PASSWORD_HASH_KEY_LENGTH,
    )) as Buffer;
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
