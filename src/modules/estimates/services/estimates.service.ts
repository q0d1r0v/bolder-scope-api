import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AiProvider,
  EstimateStatus,
  InviteStatus,
  ProjectEventType,
  ProjectStage,
  SystemRole,
} from '@prisma/client';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import {
  buildPrismaPagination,
  paginate,
} from '@/common/helpers/pagination.helper';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
import { GenerateEstimateDto } from '@/modules/estimates/dto/generate-estimate.dto';

@Injectable()
export class EstimatesService {
  private readonly logger = new Logger(EstimatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async generate(payload: GenerateEstimateDto, user: CurrentUserShape) {
    const project = await this.prisma.project.findUnique({
      where: { id: payload.projectId },
      select: { id: true, organizationId: true, currency: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.requireProjectAccess(
      payload.projectId,
      project.organizationId,
      user,
    );

    const requirementSnapshot = payload.requirementSnapshotId
      ? await this.prisma.requirementSnapshot.findUnique({
          where: { id: payload.requirementSnapshotId },
          select: { id: true, structuredJson: true },
        })
      : await this.prisma.requirementSnapshot.findFirst({
          where: { projectId: payload.projectId },
          orderBy: { version: 'desc' },
          select: { id: true, structuredJson: true },
        });

    if (!requirementSnapshot) {
      throw new BadRequestException(
        'No requirement snapshot found. Generate requirements first.',
      );
    }

    const features = await this.prisma.featureItem.findMany({
      where: { requirementSnapshotId: requirementSnapshot.id },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        complexity: true,
      },
      orderBy: { orderIndex: 'asc' },
    });

    if (features.length === 0) {
      throw new BadRequestException(
        'No features found for this requirement. Generate requirements with features first.',
      );
    }

    const currency = payload.targetCurrency ?? project.currency;

    const aiContext = {
      organizationId: project.organizationId,
      projectId: project.id,
      userId: user.userId,
    };

    const { result: estimation, aiRunId } =
      await this.aiService.estimateTimelineAndCost(
        requirementSnapshot.structuredJson as Record<string, unknown>,
        features.map((f) => ({
          title: f.title,
          description: f.description ?? '',
          priority: f.priority,
          complexity: f.complexity ?? 'M',
        })),
        currency,
        aiContext,
      );

    const latestVersion = await this.prisma.estimateSnapshot.findFirst({
      where: { projectId: payload.projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const estimate = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.estimateSnapshot.create({
        data: {
          projectId: payload.projectId,
          requirementSnapshotId: requirementSnapshot.id,
          version: nextVersion,
          status: EstimateStatus.GENERATED,
          aiProvider: AiProvider.CLAUDE,
          currency,
          timelineMinDays: estimation.timelineMinDays,
          timelineMaxDays: estimation.timelineMaxDays,
          costMin: estimation.costMin,
          costMax: estimation.costMax,
          confidenceScore: estimation.confidenceScore,
          assumptions: estimation.assumptions,
          breakdownJson: estimation as object,
          createdById: user.userId,
        },
        select: {
          id: true,
          version: true,
          status: true,
          currency: true,
          timelineMinDays: true,
          timelineMaxDays: true,
          costMin: true,
          costMax: true,
          confidenceScore: true,
          assumptions: true,
          createdAt: true,
        },
      });

      if (estimation.lineItems && estimation.lineItems.length > 0) {
        await tx.estimateLineItem.createMany({
          data: estimation.lineItems.map((item, index) => {
            const matchingFeature = features.find(
              (f) => f.title.toLowerCase() === item.name.toLowerCase(),
            );

            return {
              estimateId: snapshot.id,
              featureItemId: matchingFeature?.id ?? null,
              name: item.name,
              description: item.description,
              hoursMin: item.hoursMin,
              hoursMax: item.hoursMax,
              costMin: item.costMin,
              costMax: item.costMax,
              sortOrder: index,
            };
          }),
        });
      }

      await tx.project.update({
        where: { id: payload.projectId },
        data: { stage: ProjectStage.ESTIMATION },
      });

      await tx.projectActivity.create({
        data: {
          organizationId: project.organizationId,
          projectId: payload.projectId,
          actorUserId: user.userId,
          eventType: ProjectEventType.ESTIMATE_GENERATED,
          summary: `Estimate v${nextVersion} generated (${currency} ${estimation.costMin}-${estimation.costMax})`,
          payload: {
            estimateSnapshotId: snapshot.id,
            aiRunId,
            lineItemCount: estimation.lineItems?.length ?? 0,
          },
        },
      });

      return snapshot;
    });

    const lineItems = await this.prisma.estimateLineItem.findMany({
      where: { estimateId: estimate.id },
      select: {
        id: true,
        name: true,
        description: true,
        hoursMin: true,
        hoursMax: true,
        costMin: true,
        costMax: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      ...estimate,
      lineItems,
    };
  }

  async listByProject(
    projectId: string,
    query: PaginationQueryDto,
    user: CurrentUserShape,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.requireProjectAccess(projectId, project.organizationId, user);

    const { skip, take } = buildPrismaPagination(query);
    const where = { projectId };

    const [estimates, total] = await Promise.all([
      this.prisma.estimateSnapshot.findMany({
        where,
        select: {
          id: true,
          version: true,
          status: true,
          currency: true,
          timelineMinDays: true,
          timelineMaxDays: true,
          costMin: true,
          costMax: true,
          confidenceScore: true,
          aiProvider: true,
          createdAt: true,
          createdBy: {
            select: { id: true, fullName: true, email: true },
          },
          _count: { select: { lineItems: true } },
        },
        orderBy: { version: 'desc' },
        skip,
        take,
      }),
      this.prisma.estimateSnapshot.count({ where }),
    ]);

    return paginate(estimates, total, query);
  }

  async getLatest(projectId: string, user: CurrentUserShape) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.requireProjectAccess(projectId, project.organizationId, user);

    const estimate = await this.prisma.estimateSnapshot.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        status: true,
        currency: true,
        timelineMinDays: true,
        timelineMaxDays: true,
        costMin: true,
        costMax: true,
        confidenceScore: true,
        assumptions: true,
        aiProvider: true,
        createdAt: true,
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        lineItems: {
          select: {
            id: true,
            name: true,
            description: true,
            hoursMin: true,
            hoursMax: true,
            costMin: true,
            costMax: true,
            sortOrder: true,
            featureItem: {
              select: {
                id: true,
                title: true,
                priority: true,
                complexity: true,
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!estimate) {
      throw new NotFoundException('No estimates found for this project');
    }

    return estimate;
  }

  private async requireProjectAccess(
    projectId: string,
    organizationId: string,
    user: CurrentUserShape,
  ) {
    if (user.systemRole === SystemRole.SUPER_ADMIN) {
      return;
    }

    const projectMember = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.userId } },
      select: { role: true },
    });

    if (projectMember) {
      return;
    }

    const orgMember = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.userId } },
      select: { inviteStatus: true },
    });

    if (!orgMember || orgMember.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You do not have access to this project');
    }
  }
}
