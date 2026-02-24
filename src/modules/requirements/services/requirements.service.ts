import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FeatureComplexity,
  FeaturePriority,
  InviteStatus,
  ProjectEventType,
  ProjectStage,
  RequirementStatus,
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
import { GenerateRequirementDto } from '@/modules/requirements/dto/generate-requirement.dto';
import { UpdateRequirementDto } from '@/modules/requirements/dto/update-requirement.dto';

@Injectable()
export class RequirementsService {
  private readonly logger = new Logger(RequirementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async generate(payload: GenerateRequirementDto, user: CurrentUserShape) {
    const project = await this.prisma.project.findUnique({
      where: { id: payload.projectId },
      select: {
        id: true,
        organizationId: true,
        currency: true,
        inputs: {
          select: {
            id: true,
            rawText: true,
            transcriptText: true,
            sourceType: true,
          },
          orderBy: { createdAt: 'asc' },
        },
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

    const inputTexts = project.inputs
      .map((i) => i.rawText || i.transcriptText)
      .filter((t): t is string => !!t);

    if (inputTexts.length === 0) {
      throw new BadRequestException(
        'Project has no text inputs. Add inputs before generating requirements.',
      );
    }

    const aiContext = {
      organizationId: project.organizationId,
      projectId: project.id,
      userId: user.userId,
    };

    const { result: structuredJson, aiRunId: reqAiRunId } =
      await this.aiService.structureRequirements(
        inputTexts,
        payload.instruction,
        aiContext,
      );

    const { result: features, aiRunId: featAiRunId } =
      await this.aiService.extractFeatures(
        structuredJson as unknown as Record<string, unknown>,
        aiContext,
      );

    const latestVersion = await this.prisma.requirementSnapshot.findFirst({
      where: { projectId: payload.projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const requirement = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.requirementSnapshot.create({
        data: {
          projectId: payload.projectId,
          sourceInputId: payload.sourceInputId ?? project.inputs[0]?.id ?? null,
          version: nextVersion,
          status: RequirementStatus.GENERATED,
          rawRequirementText: inputTexts.join('\n\n---\n\n'),
          structuredJson: structuredJson as object,
          assumptions: structuredJson.assumptions?.join('; ') ?? null,
          createdById: user.userId,
        },
        select: {
          id: true,
          version: true,
          status: true,
          structuredJson: true,
          assumptions: true,
          createdAt: true,
        },
      });

      if (features.length > 0) {
        await tx.featureItem.createMany({
          data: features.map((f, index) => ({
            projectId: payload.projectId,
            requirementSnapshotId: snapshot.id,
            title: f.title,
            description: f.description,
            priority: (FeaturePriority[f.priority] ??
              FeaturePriority.SHOULD) as FeaturePriority,
            complexity: (FeatureComplexity[f.complexity] ??
              null) as FeatureComplexity | null,
            orderIndex: index,
          })),
        });
      }

      await tx.project.update({
        where: { id: payload.projectId },
        data: { stage: ProjectStage.FEATURE_DEFINITION },
      });

      await tx.projectActivity.create({
        data: {
          organizationId: project.organizationId,
          projectId: payload.projectId,
          actorUserId: user.userId,
          eventType: ProjectEventType.REQUIREMENT_GENERATED,
          summary: `Requirements v${nextVersion} generated with ${features.length} features`,
          payload: {
            requirementSnapshotId: snapshot.id,
            featureCount: features.length,
            aiRunIds: [reqAiRunId, featAiRunId],
          },
        },
      });

      return snapshot;
    });

    const featureItems = await this.prisma.featureItem.findMany({
      where: { requirementSnapshotId: requirement.id },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        complexity: true,
        orderIndex: true,
      },
      orderBy: { orderIndex: 'asc' },
    });

    return {
      ...requirement,
      features: featureItems,
    };
  }

  async update(
    requirementId: string,
    payload: UpdateRequirementDto,
    user: CurrentUserShape,
  ) {
    const requirement = await this.prisma.requirementSnapshot.findUnique({
      where: { id: requirementId },
      select: {
        id: true,
        projectId: true,
        project: { select: { organizationId: true } },
      },
    });

    if (!requirement) {
      throw new NotFoundException('Requirement snapshot not found');
    }

    await this.requireProjectAccess(
      requirement.projectId,
      requirement.project.organizationId,
      user,
    );

    const data: Record<string, unknown> = {
      structuredJson: payload.structuredJson,
    };

    if (payload.assumptions !== undefined) {
      data.assumptions = payload.assumptions;
    }

    if (payload.status) {
      data.status = payload.status;
    }

    const updated = await this.prisma.requirementSnapshot.update({
      where: { id: requirementId },
      data,
      select: {
        id: true,
        version: true,
        status: true,
        structuredJson: true,
        assumptions: true,
        updatedAt: true,
      },
    });

    return updated;
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

    const [snapshots, total] = await Promise.all([
      this.prisma.requirementSnapshot.findMany({
        where,
        select: {
          id: true,
          version: true,
          status: true,
          assumptions: true,
          createdAt: true,
          createdBy: {
            select: { id: true, fullName: true, email: true },
          },
          _count: { select: { features: true } },
        },
        orderBy: { version: 'desc' },
        skip,
        take,
      }),
      this.prisma.requirementSnapshot.count({ where }),
    ]);

    return paginate(snapshots, total, query);
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
