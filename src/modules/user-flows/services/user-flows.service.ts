import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AiProvider,
  InviteStatus,
  ProjectEventType,
  ProjectStage,
  SystemRole,
  UserFlowStatus,
} from '@prisma/client';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import {
  buildPrismaPagination,
  paginate,
} from '@/common/helpers/pagination.helper';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
import { GenerateUserFlowDto } from '@/modules/user-flows/dto/generate-user-flow.dto';

@Injectable()
export class UserFlowsService {
  private readonly logger = new Logger(UserFlowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async generate(payload: GenerateUserFlowDto, user: CurrentUserShape) {
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

    const aiContext = {
      organizationId: project.organizationId,
      projectId: project.id,
      userId: user.userId,
    };

    const { result: userFlowResult, aiRunId } =
      await this.aiService.generateUserFlows(
        requirementSnapshot.structuredJson as Record<string, unknown>,
        features.map((f) => ({
          title: f.title,
          description: f.description ?? '',
          priority: f.priority,
          complexity: f.complexity ?? 'M',
        })),
        aiContext,
      );

    const latestVersion = await this.prisma.userFlowSnapshot.findFirst({
      where: { projectId: payload.projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const snapshot = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userFlowSnapshot.create({
        data: {
          projectId: payload.projectId,
          requirementSnapshotId: requirementSnapshot.id,
          version: nextVersion,
          status: UserFlowStatus.GENERATED,
          aiProvider: AiProvider.CLAUDE,
          screenCount: userFlowResult.screens.length,
          flowJson: userFlowResult as object,
          assumptions: userFlowResult.assumptions ?? null,
          createdById: user.userId,
        },
        select: {
          id: true,
          version: true,
          status: true,
          screenCount: true,
          assumptions: true,
          createdAt: true,
        },
      });

      const screenIdMap = new Map<string, string>();
      for (const [index, screen] of userFlowResult.screens.entries()) {
        const matchingFeature = features.find(
          (f) => f.title.toLowerCase() === screen.featureTitle?.toLowerCase(),
        );
        const createdScreen = await tx.userFlowScreen.create({
          data: {
            userFlowSnapshotId: created.id,
            featureItemId: matchingFeature?.id ?? null,
            name: screen.name,
            description: screen.description,
            screenType: screen.screenType,
            purpose: screen.purpose,
            userActions: screen.userActions,
            entryPoint: screen.entryPoint,
            sortOrder: index,
          },
        });
        screenIdMap.set(screen.name, createdScreen.id);
      }

      const validTransitions = userFlowResult.transitions.filter(
        (t) => screenIdMap.has(t.fromScreen) && screenIdMap.has(t.toScreen),
      );

      if (validTransitions.length > 0) {
        await tx.userFlowTransition.createMany({
          data: validTransitions.map((t, index) => ({
            fromScreenId: screenIdMap.get(t.fromScreen)!,
            toScreenId: screenIdMap.get(t.toScreen)!,
            triggerAction: t.triggerAction,
            triggerLabel: t.triggerLabel ?? null,
            condition: t.condition ?? null,
            sortOrder: index,
          })),
        });
      }

      await tx.project.update({
        where: { id: payload.projectId },
        data: { stage: ProjectStage.WIREFRAMING },
      });

      await tx.projectActivity.create({
        data: {
          organizationId: project.organizationId,
          projectId: payload.projectId,
          actorUserId: user.userId,
          eventType: ProjectEventType.USER_FLOW_GENERATED,
          summary: `User flow v${nextVersion} generated with ${userFlowResult.screens.length} screens and ${validTransitions.length} transitions`,
          payload: {
            userFlowSnapshotId: created.id,
            aiRunId,
            screenCount: userFlowResult.screens.length,
            transitionCount: validTransitions.length,
          },
        },
      });

      return created;
    });

    const screens = await this.prisma.userFlowScreen.findMany({
      where: { userFlowSnapshotId: snapshot.id },
      select: {
        id: true,
        name: true,
        description: true,
        screenType: true,
        purpose: true,
        userActions: true,
        entryPoint: true,
        sortOrder: true,
        featureItem: {
          select: { id: true, title: true, priority: true, complexity: true },
        },
        transitionsFrom: {
          select: {
            id: true,
            toScreenId: true,
            triggerAction: true,
            triggerLabel: true,
            condition: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      ...snapshot,
      screens,
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

    const [userFlows, total] = await Promise.all([
      this.prisma.userFlowSnapshot.findMany({
        where,
        select: {
          id: true,
          version: true,
          status: true,
          screenCount: true,
          assumptions: true,
          aiProvider: true,
          createdAt: true,
          createdBy: {
            select: { id: true, fullName: true, email: true },
          },
          screens: {
            select: {
              id: true,
              name: true,
              description: true,
              screenType: true,
              purpose: true,
              userActions: true,
              entryPoint: true,
              sortOrder: true,
              featureItem: {
                select: {
                  id: true,
                  title: true,
                  priority: true,
                  complexity: true,
                },
              },
              transitionsFrom: {
                select: {
                  id: true,
                  toScreenId: true,
                  triggerAction: true,
                  triggerLabel: true,
                  condition: true,
                  sortOrder: true,
                },
                orderBy: { sortOrder: 'asc' },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { version: 'desc' },
        skip,
        take,
      }),
      this.prisma.userFlowSnapshot.count({ where }),
    ]);

    return paginate(userFlows, total, query);
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

    const userFlow = await this.prisma.userFlowSnapshot.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        status: true,
        screenCount: true,
        flowJson: true,
        assumptions: true,
        aiProvider: true,
        createdAt: true,
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        screens: {
          select: {
            id: true,
            name: true,
            description: true,
            screenType: true,
            purpose: true,
            userActions: true,
            entryPoint: true,
            sortOrder: true,
            featureItem: {
              select: { id: true, title: true, priority: true, complexity: true },
            },
            transitionsFrom: {
              select: {
                id: true,
                toScreenId: true,
                triggerAction: true,
                triggerLabel: true,
                condition: true,
                sortOrder: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!userFlow) {
      throw new NotFoundException('No user flows found for this project');
    }

    return userFlow;
  }

  async getById(userFlowId: string, user: CurrentUserShape) {
    const userFlow = await this.prisma.userFlowSnapshot.findUnique({
      where: { id: userFlowId },
      select: {
        id: true,
        projectId: true,
        version: true,
        status: true,
        screenCount: true,
        flowJson: true,
        assumptions: true,
        aiProvider: true,
        createdAt: true,
        project: {
          select: { id: true, organizationId: true },
        },
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        screens: {
          select: {
            id: true,
            name: true,
            description: true,
            screenType: true,
            purpose: true,
            userActions: true,
            entryPoint: true,
            sortOrder: true,
            featureItem: {
              select: { id: true, title: true, priority: true, complexity: true },
            },
            transitionsFrom: {
              select: {
                id: true,
                toScreenId: true,
                triggerAction: true,
                triggerLabel: true,
                condition: true,
                sortOrder: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!userFlow) {
      throw new NotFoundException('User flow not found');
    }

    await this.requireProjectAccess(
      userFlow.projectId,
      userFlow.project.organizationId,
      user,
    );

    const { project: _project, projectId: _projectId, ...result } = userFlow;
    return result;
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
