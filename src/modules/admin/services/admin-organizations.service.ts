import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  buildPrismaPagination,
  paginate,
} from '@/common/helpers/pagination.helper';
import {
  AdminOrganizationsQueryDto,
  AdminUpdateOrganizationDto,
} from '@/modules/admin/dto/admin-organizations.dto';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

@Injectable()
export class AdminOrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AdminOrganizationsQueryDto) {
    const where: Prisma.OrganizationWhereInput = {};

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const { skip, take } = buildPrismaPagination(query);

    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          status: true,
          billingEmail: true,
          stripeCustomerId: true,
          createdAt: true,
          _count: { select: { memberships: true, projects: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.organization.count({ where }),
    ]);

    const data = organizations.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      status: org.status,
      billingEmail: org.billingEmail,
      stripeCustomerId: org.stripeCustomerId,
      createdAt: org.createdAt,
      memberCount: org._count.memberships,
      projectCount: org._count.projects,
    }));

    return paginate(data, total, query);
  }

  async findOne(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        status: true,
        billingEmail: true,
        stripeCustomerId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { memberships: true, projects: true } },
        subscriptions: {
          where: { status: SubscriptionStatus.ACTIVE },
          select: {
            id: true,
            stripeSubscriptionId: true,
            status: true,
            interval: true,
            seats: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
          },
          take: 1,
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      status: org.status,
      billingEmail: org.billingEmail,
      stripeCustomerId: org.stripeCustomerId,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      memberCount: org._count.memberships,
      projectCount: org._count.projects,
      activeSubscription: org.subscriptions[0] ?? null,
    };
  }

  async update(organizationId: string, payload: AdminUpdateOrganizationDto) {
    const existing = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Organization not found');
    }

    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(payload.status !== undefined && { status: payload.status }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        status: true,
        billingEmail: true,
        updatedAt: true,
      },
    });

    return org;
  }

  async getMembers(organizationId: string, query: PaginationQueryDto) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

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

  async getProjects(organizationId: string, query: PaginationQueryDto) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const where = { organizationId };
    const { skip, take } = buildPrismaPagination(query);

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          stage: true,
          sourceType: true,
          currency: true,
          createdAt: true,
          clientOrganization: {
            select: { id: true, name: true },
          },
          _count: { select: { members: true, inputs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.project.count({ where }),
    ]);

    const data = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      stage: p.stage,
      sourceType: p.sourceType,
      currency: p.currency,
      createdAt: p.createdAt,
      clientOrganization: p.clientOrganization,
      memberCount: p._count.members,
      inputCount: p._count.inputs,
    }));

    return paginate(data, total, query);
  }
}
