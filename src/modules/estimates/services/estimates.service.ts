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
import type { ProfessionalEstimateResult } from '@/modules/ai/services/ai.service';
import { GenerateEstimateDto } from '@/modules/estimates/dto/generate-estimate.dto';
import { GenerateProfessionalEstimateDto } from '@/modules/estimates/dto/generate-professional-estimate.dto';
import { RegenerateEstimateSectionDto } from '@/modules/estimates/dto/regenerate-estimate-section.dto';
import { EstimatePdfService } from '@/modules/estimates/services/estimate-pdf.service';

@Injectable()
export class EstimatesService {
  private readonly logger = new Logger(EstimatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly pdfService: EstimatePdfService,
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

  async generateProfessional(
    payload: GenerateProfessionalEstimateDto,
    user: CurrentUserShape,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: payload.projectId },
      select: {
        id: true,
        name: true,
        description: true,
        organizationId: true,
        currency: true,
        organization: { select: { name: true } },
        clientOrganization: { select: { name: true } },
      },
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
    const clientName =
      payload.clientName ??
      project.clientOrganization?.name ??
      project.organization.name;

    let techStack: {
      frontend: string[];
      backend: string[];
      database: string[];
      infrastructure: string[];
    } | undefined;

    const techStackSelect = {
      frontend: true,
      backend: true,
      database: true,
      infrastructure: true,
    } as const;

    if (payload.techStackRecommendationId) {
      const rec = await this.prisma.techStackRecommendation.findUnique({
        where: { id: payload.techStackRecommendationId },
        select: techStackSelect,
      });
      if (rec) {
        techStack = {
          frontend: rec.frontend,
          backend: rec.backend,
          database: rec.database,
          infrastructure: rec.infrastructure,
        };
      }
    } else {
      const latestRec = await this.prisma.techStackRecommendation.findFirst({
        where: { projectId: payload.projectId },
        orderBy: { version: 'desc' },
        select: techStackSelect,
      });
      if (latestRec) {
        techStack = {
          frontend: latestRec.frontend,
          backend: latestRec.backend,
          database: latestRec.database,
          infrastructure: latestRec.infrastructure,
        };
      }
    }

    const aiContext = {
      organizationId: project.organizationId,
      projectId: project.id,
      userId: user.userId,
    };

    const { result: estimation, aiRunId } =
      await this.aiService.generateProfessionalEstimate(
        requirementSnapshot.structuredJson as Record<string, unknown>,
        features.map((f) => ({
          title: f.title,
          description: f.description ?? '',
          priority: f.priority,
          complexity: f.complexity ?? 'M',
        })),
        currency,
        project.name,
        clientName,
        techStack,
        payload.instruction,
        aiContext,
      );
    const normalizedEstimation = this.normalizeProfessionalEstimate(estimation);

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
          timelineMinDays: normalizedEstimation.timelineMinDays,
          timelineMaxDays: normalizedEstimation.timelineMaxDays,
          costMin: normalizedEstimation.costMin,
          costMax: normalizedEstimation.costMax,
          confidenceScore: normalizedEstimation.confidenceScore,
          assumptions:
            normalizedEstimation.assumptions?.assumptions?.join('; ') ?? null,
          breakdownJson: normalizedEstimation as object,
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
          createdAt: true,
        },
      });

      const lineItemsData: Array<{
        estimateId: string;
        featureItemId: string | null;
        name: string;
        description: string;
        hoursMin: number;
        hoursMax: number;
        costMin: number;
        costMax: number;
        sortOrder: number;
        metadata: object;
      }> = [];
      let sortOrder = 0;
      const lineItemHourlyRate =
        this.pickFiniteNumber(
          normalizedEstimation.costCalculation?.hourlyRate,
        ) ?? 0;

      for (const mod of normalizedEstimation.wbs.modules) {
        for (const task of mod.tasks) {
          const matchingFeature = features.find(
            (f) => f.title.toLowerCase() === task.taskName.toLowerCase(),
          );

          lineItemsData.push({
            estimateId: snapshot.id,
            featureItemId: matchingFeature?.id ?? null,
            name: task.taskName,
            description: task.description,
            hoursMin: task.hoursMin,
            hoursMax: task.hoursMax,
            costMin: task.hoursMin * lineItemHourlyRate,
            costMax: task.hoursMax * lineItemHourlyRate,
            sortOrder: sortOrder++,
            metadata: {
              moduleName: mod.moduleName,
              taskId: task.taskId,
              complexity: task.complexity,
              responsibleRole: task.responsibleRole,
              status: task.status,
              dependencies: task.dependencies,
              daysMin: task.daysMin,
              daysMax: task.daysMax,
            },
          });
        }
      }

      if (lineItemsData.length > 0) {
        await tx.estimateLineItem.createMany({ data: lineItemsData });
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
          summary: `Professional estimate v${nextVersion} generated (${currency} ${normalizedEstimation.costMin}-${normalizedEstimation.costMax})`,
          payload: {
            estimateSnapshotId: snapshot.id,
            aiRunId,
            lineItemCount: lineItemsData.length,
            type: 'professional',
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
        metadata: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      ...estimate,
      breakdownJson: normalizedEstimation,
      lineItems,
    };
  }

  async getFullEstimate(projectId: string, user: CurrentUserShape) {
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
        breakdownJson: true,
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
            metadata: true,
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

  async regenerateSection(
    payload: RegenerateEstimateSectionDto,
    user: CurrentUserShape,
  ) {
    const estimate = await this.prisma.estimateSnapshot.findUnique({
      where: { id: payload.estimateSnapshotId },
      select: {
        id: true,
        projectId: true,
        breakdownJson: true,
        project: { select: { organizationId: true } },
      },
    });

    if (!estimate) {
      throw new NotFoundException('Estimate not found');
    }

    if (!estimate.breakdownJson) {
      throw new BadRequestException(
        'This estimate does not have a professional breakdown. Generate a professional estimate first.',
      );
    }

    await this.requireProjectAccess(
      estimate.projectId,
      estimate.project.organizationId,
      user,
    );

    const fullEstimate = estimate.breakdownJson as unknown as ProfessionalEstimateResult;

    const aiContext = {
      organizationId: estimate.project.organizationId,
      projectId: estimate.projectId,
      userId: user.userId,
    };

    const { result: regeneratedSection } =
      await this.aiService.regenerateEstimateSection(
        fullEstimate,
        payload.section,
        payload.instruction,
        aiContext,
      );

    const updatedBreakdown = {
      ...fullEstimate,
      [payload.section]: regeneratedSection,
    };

    await this.prisma.estimateSnapshot.update({
      where: { id: estimate.id },
      data: { breakdownJson: updatedBreakdown as object },
    });

    return {
      estimateSnapshotId: estimate.id,
      section: payload.section,
      data: regeneratedSection,
    };
  }

  async exportPdf(estimateId: string, user: CurrentUserShape): Promise<Buffer> {
    const estimate = await this.prisma.estimateSnapshot.findUnique({
      where: { id: estimateId },
      select: {
        id: true,
        projectId: true,
        version: true,
        currency: true,
        breakdownJson: true,
        createdAt: true,
        project: { select: { id: true, organizationId: true } },
      },
    });

    if (!estimate) {
      throw new NotFoundException('Estimate not found');
    }

    if (!estimate.breakdownJson) {
      throw new BadRequestException(
        'This estimate does not have a professional breakdown for PDF export.',
      );
    }

    await this.requireProjectAccess(
      estimate.projectId,
      estimate.project.organizationId,
      user,
    );

    return this.pdfService.generate(
      estimate.breakdownJson as unknown as ProfessionalEstimateResult,
      {
        version: estimate.version,
        currency: estimate.currency,
        createdAt: estimate.createdAt,
      },
    );
  }

  private normalizeProfessionalEstimate(
    estimation: ProfessionalEstimateResult,
  ): ProfessionalEstimateResult {
    const timelineFromDates = this.calculateTimelineDays(
      estimation.timeline?.startDate,
      estimation.timeline?.endDate,
    );
    const timelineFromWeeks = this.pickFiniteNumber(
      estimation.timeline?.totalWeeks,
    );

    const timelineMinCandidate = this.pickFiniteNumber(
      estimation.timelineMinDays,
      estimation.wbs?.totalDaysMin,
      timelineFromDates,
      timelineFromWeeks !== null ? timelineFromWeeks * 7 : null,
    );
    const timelineMaxCandidate = this.pickFiniteNumber(
      estimation.timelineMaxDays,
      estimation.wbs?.totalDaysMax,
      timelineFromDates,
      timelineFromWeeks !== null ? timelineFromWeeks * 7 : null,
      timelineMinCandidate,
    );

    const totalCost = this.pickFiniteNumber(
      estimation.costCalculation?.totalCost,
    );
    const contingencyAmount = this.pickFiniteNumber(
      estimation.costCalculation?.contingencyAmount,
    );
    const hourlyRate = this.pickFiniteNumber(
      estimation.costCalculation?.hourlyRate,
    );
    const totalHoursMin = this.pickFiniteNumber(
      estimation.wbs?.totalHoursMin,
      estimation.costCalculation?.totalHours,
    );
    const totalHoursMax = this.pickFiniteNumber(
      estimation.wbs?.totalHoursMax,
      estimation.costCalculation?.totalHours,
      totalHoursMin,
    );
    const costFromModuleBreakdown = Array.isArray(
      estimation.costCalculation?.costBreakdownByModule,
    )
      ? estimation.costCalculation.costBreakdownByModule.reduce(
          (sum, item) => sum + (this.pickFiniteNumber(item.cost) ?? 0),
          0,
        )
      : null;

    const costMinCandidate = this.pickFiniteNumber(
      estimation.costMin,
      totalCost,
      hourlyRate !== null && totalHoursMin !== null
        ? hourlyRate * totalHoursMin
        : null,
      costFromModuleBreakdown,
    );
    const costMaxCandidate = this.pickFiniteNumber(
      estimation.costMax,
      totalCost !== null
        ? totalCost + (this.pickFiniteNumber(contingencyAmount) ?? 0)
        : null,
      hourlyRate !== null && totalHoursMax !== null
        ? hourlyRate * totalHoursMax
        : null,
      costMinCandidate,
    );

    if (
      timelineMinCandidate === null ||
      timelineMaxCandidate === null ||
      costMinCandidate === null ||
      costMaxCandidate === null
    ) {
      throw new BadRequestException(
        'AI returned incomplete estimate totals (timeline/cost). Please regenerate the estimate.',
      );
    }

    const timelineMinDays = Math.max(1, Math.round(timelineMinCandidate));
    const timelineMaxDays = Math.max(
      timelineMinDays,
      Math.round(timelineMaxCandidate),
    );
    const costMin = Number(Math.max(0, costMinCandidate).toFixed(2));
    const costMax = Number(Math.max(costMin, costMaxCandidate).toFixed(2));

    return {
      ...estimation,
      timelineMinDays,
      timelineMaxDays,
      costMin,
      costMax,
    };
  }

  private calculateTimelineDays(
    startDate?: string,
    endDate?: string,
  ): number | null {
    if (!startDate || !endDate) {
      return null;
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }

    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) {
      return null;
    }

    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(1, days);
  }

  private pickFiniteNumber(...values: Array<unknown>): number | null {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
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
