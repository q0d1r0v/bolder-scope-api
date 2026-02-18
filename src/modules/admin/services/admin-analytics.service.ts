import { Injectable } from '@nestjs/common';
import {
  AiRunStatus,
  OrganizationType,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [
      totalUsers,
      activeUsers,
      totalOrganizations,
      agencyCount,
      clientCount,
      totalProjects,
      activeSubscriptions,
      revenueAggregate,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.organization.count(),
      this.prisma.organization.count({ where: { type: OrganizationType.AGENCY } }),
      this.prisma.organization.count({ where: { type: OrganizationType.CLIENT } }),
      this.prisma.project.count(),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.prisma.billingInvoice.aggregate({ _sum: { amountPaid: true } }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
      },
      organizations: {
        total: totalOrganizations,
        agencies: agencyCount,
        clients: clientCount,
      },
      projects: {
        total: totalProjects,
      },
      subscriptions: {
        active: activeSubscriptions,
      },
      revenue: {
        totalPaid: revenueAggregate._sum.amountPaid ?? 0,
      },
    };
  }

  async getAiUsage() {
    const [
      totalRuns,
      successfulRuns,
      failedRuns,
      costAggregate,
      byProvider,
      byTaskType,
    ] = await Promise.all([
      this.prisma.aiRun.count(),
      this.prisma.aiRun.count({ where: { status: AiRunStatus.SUCCESS } }),
      this.prisma.aiRun.count({ where: { status: AiRunStatus.FAILED } }),
      this.prisma.aiRun.aggregate({
        _sum: { totalCostUsd: true, inputTokens: true, outputTokens: true },
      }),
      this.prisma.aiRun.groupBy({
        by: ['provider'],
        _count: { id: true },
        _sum: { totalCostUsd: true, inputTokens: true, outputTokens: true },
      }),
      this.prisma.aiRun.groupBy({
        by: ['taskType'],
        _count: { id: true },
        _sum: { totalCostUsd: true },
      }),
    ]);

    return {
      totals: {
        runs: totalRuns,
        successful: successfulRuns,
        failed: failedRuns,
        totalCostUsd: costAggregate._sum.totalCostUsd ?? 0,
        inputTokens: costAggregate._sum.inputTokens ?? 0,
        outputTokens: costAggregate._sum.outputTokens ?? 0,
      },
      byProvider: byProvider.map((p) => ({
        provider: p.provider,
        count: p._count.id,
        totalCostUsd: p._sum.totalCostUsd ?? 0,
        inputTokens: p._sum.inputTokens ?? 0,
        outputTokens: p._sum.outputTokens ?? 0,
      })),
      byTaskType: byTaskType.map((t) => ({
        taskType: t.taskType,
        count: t._count.id,
        totalCostUsd: t._sum.totalCostUsd ?? 0,
      })),
    };
  }

  async getRecentActivity() {
    const [recentUsers, recentOrganizations, recentProjects] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.organization.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.project.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          stage: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      recentUsers,
      recentOrganizations,
      recentProjects,
    };
  }
}
