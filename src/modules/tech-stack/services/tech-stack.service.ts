import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InviteStatus, ProjectEventType, SystemRole } from '@prisma/client';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import {
  buildPrismaPagination,
  paginate,
} from '@/common/helpers/pagination.helper';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
import { GenerateTechStackDto } from '@/modules/tech-stack/dto/generate-tech-stack.dto';

@Injectable()
export class TechStackService {
  private readonly logger = new Logger(TechStackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async generate(payload: GenerateTechStackDto, user: CurrentUserShape) {
    const project = await this.prisma.project.findUnique({
      where: { id: payload.projectId },
      select: { id: true, organizationId: true },
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
        title: true,
        description: true,
        priority: true,
        complexity: true,
      },
      orderBy: { orderIndex: 'asc' },
    });

    const aiContext = {
      organizationId: project.organizationId,
      projectId: project.id,
      userId: user.userId,
    };

    const { result: techStack, aiRunId } =
      await this.aiService.recommendTechStack(
        requirementSnapshot.structuredJson as Record<string, unknown>,
        features.map((f) => ({
          title: f.title,
          description: f.description ?? '',
          priority: f.priority,
          complexity: f.complexity ?? 'M',
        })),
        payload.instruction,
        aiContext,
      );

    const latestVersion = await this.prisma.techStackRecommendation.findFirst({
      where: { projectId: payload.projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const recommendation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.techStackRecommendation.create({
        data: {
          projectId: payload.projectId,
          requirementSnapshotId: requirementSnapshot.id,
          version: nextVersion,
          frontend: techStack.frontend,
          backend: techStack.backend,
          database: techStack.database,
          infrastructure: techStack.infrastructure,
          integrations: techStack.integrations,
          rationale: techStack.rationale,
        },
        select: {
          id: true,
          version: true,
          frontend: true,
          backend: true,
          database: true,
          infrastructure: true,
          integrations: true,
          rationale: true,
          createdAt: true,
        },
      });

      await tx.projectActivity.create({
        data: {
          organizationId: project.organizationId,
          projectId: payload.projectId,
          actorUserId: user.userId,
          eventType: ProjectEventType.TECH_STACK_GENERATED,
          summary: `Tech stack v${nextVersion} recommended`,
          payload: {
            techStackRecommendationId: created.id,
            aiRunId,
          },
        },
      });

      return created;
    });

    return recommendation;
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

    const [recommendations, total] = await Promise.all([
      this.prisma.techStackRecommendation.findMany({
        where,
        select: {
          id: true,
          version: true,
          frontend: true,
          backend: true,
          database: true,
          infrastructure: true,
          integrations: true,
          rationale: true,
          createdAt: true,
        },
        orderBy: { version: 'desc' },
        skip,
        take,
      }),
      this.prisma.techStackRecommendation.count({ where }),
    ]);

    return paginate(recommendations, total, query);
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
