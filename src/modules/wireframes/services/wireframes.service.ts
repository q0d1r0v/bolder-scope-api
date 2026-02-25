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
  Prisma,
  ProjectEventType,
  ProjectStage,
  SystemRole,
  WireframeStatus,
} from '@prisma/client';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import {
  buildPrismaPagination,
  paginate,
} from '@/common/helpers/pagination.helper';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
import { GenerateWireframeDto } from '@/modules/wireframes/dto/generate-wireframe.dto';
import { ExportFormat } from '@/modules/wireframes/dto/export-wireframe.dto';
import { TextToDesignDto } from '@/modules/wireframes/dto/text-to-design.dto';
import { RefineScreenDto } from '@/modules/wireframes/dto/refine-screen.dto';
import { RegenerateScreenDto } from '@/modules/wireframes/dto/regenerate-screen.dto';
import { AddScreenDto } from '@/modules/wireframes/dto/add-screen.dto';
import { ApplyStyleDto } from '@/modules/wireframes/dto/apply-style.dto';
import { ReorderScreensDto } from '@/modules/wireframes/dto/reorder-screens.dto';
import { RegenerateDesignSystemDto } from '@/modules/wireframes/dto/regenerate-design-system.dto';
import { INDUSTRY_PATTERNS } from '@/modules/wireframes/prompts/layout-generation.prompt';

@Injectable()
export class WireframesService {
  private readonly logger = new Logger(WireframesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  // ─── GENERATE (from requirements + user flows) ───

  async generate(payload: GenerateWireframeDto, user: CurrentUserShape) {
    const startTime = Date.now();

    const project = await this.prisma.project.findUnique({
      where: { id: payload.projectId },
      select: { id: true, organizationId: true, name: true, description: true },
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

    const userFlowSnapshot = payload.userFlowSnapshotId
      ? await this.prisma.userFlowSnapshot.findUnique({
          where: { id: payload.userFlowSnapshotId },
          select: { id: true },
        })
      : await this.prisma.userFlowSnapshot.findFirst({
          where: { projectId: payload.projectId },
          orderBy: { version: 'desc' },
          select: { id: true },
        });

    if (!userFlowSnapshot) {
      throw new BadRequestException(
        'No user flow found. Generate user flows first.',
      );
    }

    const userFlowScreens = await this.prisma.userFlowScreen.findMany({
      where: { userFlowSnapshotId: userFlowSnapshot.id },
      select: {
        id: true,
        name: true,
        description: true,
        screenType: true,
        purpose: true,
        userActions: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    if (userFlowScreens.length === 0) {
      throw new BadRequestException(
        'No screens found in the user flow. Generate user flows first.',
      );
    }

    const aiContext = {
      organizationId: project.organizationId,
      projectId: project.id,
      userId: user.userId,
    };

    const { result: wireframeResult, aiRunId } =
      await this.aiService.generateWireframes(
        requirementSnapshot.structuredJson as Record<string, unknown>,
        features.map((f) => ({
          title: f.title,
          description: f.description ?? '',
          priority: f.priority,
          complexity: f.complexity ?? 'M',
        })),
        userFlowScreens.map((s) => ({
          name: s.name,
          description: s.description ?? '',
          screenType: s.screenType ?? '',
          purpose: s.purpose ?? '',
          userActions: s.userActions,
        })),
        aiContext,
      );

    const latestVersion = await this.prisma.wireframeSnapshot.findFirst({
      where: { projectId: payload.projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const flowScreenMap = new Map<string, string>();
    for (const screen of userFlowScreens) {
      flowScreenMap.set(screen.name, screen.id);
    }

    const generationTimeMs = Date.now() - startTime;

    const snapshot = await this.prisma.$transaction(async (tx) => {
      const created = await tx.wireframeSnapshot.create({
        data: {
          projectId: payload.projectId,
          requirementSnapshotId: requirementSnapshot.id,
          userFlowSnapshotId: userFlowSnapshot.id,
          version: nextVersion,
          status: WireframeStatus.GENERATED,
          aiProvider: AiProvider.CLAUDE,
          aiModel: 'claude-sonnet-4-20250514',
          pageCount: wireframeResult.screens.length,
          wireframeJson: wireframeResult as object,
          designSystem: wireframeResult.designSystem as object,
          assumptions: wireframeResult.assumptions ?? null,
          generationTimeMs,
          createdById: user.userId,
        },
        select: {
          id: true,
          version: true,
          status: true,
          pageCount: true,
          designSystem: true,
          assumptions: true,
          generationTimeMs: true,
          createdAt: true,
        },
      });

      for (const [index, screenData] of wireframeResult.screens.entries()) {
        await tx.wireframeScreen.create({
          data: {
            wireframeSnapshotId: created.id,
            userFlowScreenId: flowScreenMap.get(screenData.screenName) ?? null,
            name: screenData.screenName,
            description: screenData.description,
            layoutJson: {
              title: screenData.title,
              sections: screenData.sections,
            } as Prisma.InputJsonValue,
            sortOrder: index,
            screenType: screenData.screenType ?? 'page',
            viewportWidth: 1440,
            viewportHeight: 900,
          },
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
          eventType: ProjectEventType.WIREFRAME_GENERATED,
          summary: `Wireframe v${nextVersion} generated with ${wireframeResult.screens.length} screens`,
          payload: {
            wireframeSnapshotId: created.id,
            aiRunId,
            screenCount: wireframeResult.screens.length,
          },
        },
      });

      return created;
    });

    const screens = await this.prisma.wireframeScreen.findMany({
      where: { wireframeSnapshotId: snapshot.id },
      select: {
        id: true,
        name: true,
        description: true,
        layoutJson: true,
        sortOrder: true,
        screenType: true,
        viewportWidth: true,
        viewportHeight: true,
        userFlowScreen: {
          select: { id: true, name: true, screenType: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      ...snapshot,
      screens,
    };
  }

  // ─── TEXT-TO-DESIGN ───

  async generateFromText(payload: TextToDesignDto, user: CurrentUserShape) {
    const startTime = Date.now();

    const project = await this.prisma.project.findUnique({
      where: { id: payload.projectId },
      select: { id: true, organizationId: true, name: true, description: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.requireProjectAccess(
      payload.projectId,
      project.organizationId,
      user,
    );

    const aiContext = {
      organizationId: project.organizationId,
      projectId: project.id,
      userId: user.userId,
    };

    const { result: designResult, aiRunId } =
      await this.aiService.generateDesignFromText(
        payload.prompt,
        {
          platform: payload.platform ?? 'WEB',
          style: payload.style,
          screenCount: payload.screenCount,
          colorScheme: payload.colorScheme,
        },
        aiContext,
      );

    const latestVersion = await this.prisma.wireframeSnapshot.findFirst({
      where: { projectId: payload.projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const viewportWidth = this.getViewportWidth(payload.platform);
    const viewportHeight = this.getViewportHeight(payload.platform);
    const generationTimeMs = Date.now() - startTime;

    const snapshot = await this.prisma.$transaction(async (tx) => {
      const created = await tx.wireframeSnapshot.create({
        data: {
          projectId: payload.projectId,
          version: nextVersion,
          status: WireframeStatus.GENERATED,
          aiProvider: AiProvider.CLAUDE,
          aiModel: 'claude-sonnet-4-20250514',
          pageCount: designResult.screens.length,
          wireframeJson: designResult as object,
          designSystem: designResult.designSystem as object,
          navigationFlow: (designResult.navigationFlow ?? []) as object,
          assumptions: designResult.assumptions ?? null,
          sourcePrompt: payload.prompt,
          platform: payload.platform ?? 'WEB',
          style: payload.style ?? null,
          generationTimeMs,
          createdById: user.userId,
        },
        select: {
          id: true,
          version: true,
          status: true,
          pageCount: true,
          designSystem: true,
          navigationFlow: true,
          assumptions: true,
          sourcePrompt: true,
          platform: true,
          style: true,
          generationTimeMs: true,
          createdAt: true,
        },
      });

      for (const [index, screenData] of designResult.screens.entries()) {
        await tx.wireframeScreen.create({
          data: {
            wireframeSnapshotId: created.id,
            name: screenData.screenName,
            description: screenData.description,
            layoutJson: {
              title: screenData.title,
              sections: screenData.sections,
            } as Prisma.InputJsonValue,
            sortOrder: index,
            screenType: screenData.screenType ?? 'page',
            viewportWidth,
            viewportHeight,
            metadata: {
              generatedFrom: 'text-to-design',
            } as Prisma.InputJsonValue,
          },
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
          eventType: ProjectEventType.DESIGN_GENERATED,
          summary: `Design v${nextVersion} generated from text prompt with ${designResult.screens.length} screens`,
          payload: {
            wireframeSnapshotId: created.id,
            aiRunId,
            screenCount: designResult.screens.length,
            platform: payload.platform ?? 'WEB',
            style: payload.style,
            prompt: payload.prompt.slice(0, 200),
          },
        },
      });

      return created;
    });

    const screens = await this.prisma.wireframeScreen.findMany({
      where: { wireframeSnapshotId: snapshot.id },
      select: {
        id: true,
        name: true,
        description: true,
        layoutJson: true,
        sortOrder: true,
        screenType: true,
        viewportWidth: true,
        viewportHeight: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      ...snapshot,
      screens,
    };
  }

  // ─── REFINE SCREEN ───

  async refineScreen(
    snapshotId: string,
    screenId: string,
    payload: RefineScreenDto,
    user: CurrentUserShape,
  ) {
    const { snapshot, screen } = await this.getSnapshotAndScreen(
      snapshotId,
      screenId,
      user,
    );

    const aiContext = {
      organizationId: snapshot.project.organizationId,
      projectId: snapshot.projectId,
      userId: user.userId,
    };

    const { result } = await this.aiService.refineScreenLayout(
      screen.name,
      screen.layoutJson as Record<string, unknown>,
      (snapshot.designSystem as Record<string, unknown>) ?? {},
      payload.instruction,
      aiContext,
    );

    const updated = await this.prisma.wireframeScreen.update({
      where: { id: screenId },
      data: {
        layoutJson: result.layoutJson as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        description: true,
        layoutJson: true,
        sortOrder: true,
        screenType: true,
        viewportWidth: true,
        viewportHeight: true,
      },
    });

    return updated;
  }

  // ─── REGENERATE SCREEN ───

  async regenerateScreen(
    snapshotId: string,
    screenId: string,
    payload: RegenerateScreenDto,
    user: CurrentUserShape,
  ) {
    const { snapshot, screen } = await this.getSnapshotAndScreen(
      snapshotId,
      screenId,
      user,
    );

    const aiContext = {
      organizationId: snapshot.project.organizationId,
      projectId: snapshot.projectId,
      userId: user.userId,
    };

    const { result } = await this.aiService.regenerateScreenLayout(
      screen.name,
      screen.description ?? '',
      (snapshot.designSystem as Record<string, unknown>) ?? {},
      snapshot.platform ?? 'WEB',
      snapshot.style ?? 'MODERN',
      payload.instruction,
      aiContext,
    );

    const updated = await this.prisma.wireframeScreen.update({
      where: { id: screenId },
      data: {
        layoutJson: result.layoutJson as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        description: true,
        layoutJson: true,
        sortOrder: true,
        screenType: true,
        viewportWidth: true,
        viewportHeight: true,
      },
    });

    return updated;
  }

  // ─── ADD SCREEN ───

  async addScreen(
    snapshotId: string,
    payload: AddScreenDto,
    user: CurrentUserShape,
  ) {
    const snapshot = await this.getSnapshotWithAccess(snapshotId, user);

    const existingScreens = await this.prisma.wireframeScreen.findMany({
      where: { wireframeSnapshotId: snapshotId },
      select: { name: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });

    const aiContext = {
      organizationId: snapshot.project.organizationId,
      projectId: snapshot.projectId,
      userId: user.userId,
    };

    const { result } = await this.aiService.generateSingleScreenLayout(
      payload.name,
      payload.description,
      (snapshot.designSystem as Record<string, unknown>) ?? {},
      existingScreens.map((s) => s.name),
      snapshot.platform ?? 'WEB',
      snapshot.style ?? 'MODERN',
      payload.instruction,
      aiContext,
    );

    const maxSortOrder = existingScreens.reduce(
      (max, s) => Math.max(max, s.sortOrder),
      -1,
    );

    const viewportWidth = this.getViewportWidth(snapshot.platform);
    const viewportHeight = this.getViewportHeight(snapshot.platform);

    const screen = await this.prisma.wireframeScreen.create({
      data: {
        wireframeSnapshotId: snapshotId,
        name: payload.name,
        description: payload.description,
        layoutJson: result.layoutJson as Prisma.InputJsonValue,
        sortOrder: maxSortOrder + 1,
        screenType: payload.screenType ?? 'page',
        viewportWidth,
        viewportHeight,
      },
      select: {
        id: true,
        name: true,
        description: true,
        layoutJson: true,
        sortOrder: true,
        screenType: true,
        viewportWidth: true,
        viewportHeight: true,
      },
    });

    await this.prisma.wireframeSnapshot.update({
      where: { id: snapshotId },
      data: { pageCount: { increment: 1 } },
    });

    return screen;
  }

  // ─── APPLY STYLE ───

  async applyStyle(
    snapshotId: string,
    payload: ApplyStyleDto,
    user: CurrentUserShape,
  ) {
    const snapshot = await this.getSnapshotWithAccess(snapshotId, user);

    const screens = await this.prisma.wireframeScreen.findMany({
      where: { wireframeSnapshotId: snapshotId },
      select: { id: true, name: true, layoutJson: true },
      orderBy: { sortOrder: 'asc' },
    });

    const aiContext = {
      organizationId: snapshot.project.organizationId,
      projectId: snapshot.projectId,
      userId: user.userId,
    };

    const { result } = await this.aiService.applyStyleToScreens(
      screens.map((s) => ({
        name: s.name,
        layoutJson: s.layoutJson as Record<string, unknown>,
      })),
      (snapshot.designSystem as Record<string, unknown>) ?? {},
      payload.instruction,
      aiContext,
    );

    const screenMap = new Map(screens.map((s) => [s.name, s.id]));

    await this.prisma.$transaction(
      result.screens.map((updated) =>
        this.prisma.wireframeScreen.update({
          where: { id: screenMap.get(updated.screenName) ?? '' },
          data: { layoutJson: updated.layoutJson as Prisma.InputJsonValue },
        }),
      ),
    );

    return this.getById(snapshotId, user);
  }

  // ─── REORDER SCREENS ───

  async reorderScreens(
    snapshotId: string,
    payload: ReorderScreensDto,
    user: CurrentUserShape,
  ) {
    await this.getSnapshotWithAccess(snapshotId, user);

    await this.prisma.$transaction(
      payload.screenIds.map((id, index) =>
        this.prisma.wireframeScreen.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return { success: true };
  }

  // ─── DELETE SCREEN ───

  async deleteScreen(
    snapshotId: string,
    screenId: string,
    user: CurrentUserShape,
  ) {
    await this.getSnapshotAndScreen(snapshotId, screenId, user);

    await this.prisma.wireframeScreen.delete({ where: { id: screenId } });

    await this.prisma.wireframeSnapshot.update({
      where: { id: snapshotId },
      data: { pageCount: { decrement: 1 } },
    });

    return { success: true };
  }

  // ─── REGENERATE DESIGN SYSTEM ───

  async regenerateDesignSystem(
    snapshotId: string,
    payload: RegenerateDesignSystemDto,
    user: CurrentUserShape,
  ) {
    const snapshot = await this.getSnapshotWithAccess(snapshotId, user);

    const aiContext = {
      organizationId: snapshot.project.organizationId,
      projectId: snapshot.projectId,
      userId: user.userId,
    };

    const projectDescription = snapshot.sourcePrompt
      ?? snapshot.project.name
      ?? 'Application';

    const { result } = await this.aiService.regenerateDesignSystem(
      (snapshot.designSystem as Record<string, unknown>) ?? {},
      projectDescription,
      snapshot.platform ?? 'WEB',
      snapshot.style ?? 'MODERN',
      payload.instruction,
      payload.colorScheme,
      aiContext,
    );

    await this.prisma.wireframeSnapshot.update({
      where: { id: snapshotId },
      data: { designSystem: result as Prisma.InputJsonValue },
    });

    return result;
  }

  // ─── FORK SNAPSHOT ───

  async forkSnapshot(
    snapshotId: string,
    instruction: string | undefined,
    user: CurrentUserShape,
  ) {
    const snapshot = await this.getSnapshotWithAccess(snapshotId, user);

    const screens = await this.prisma.wireframeScreen.findMany({
      where: { wireframeSnapshotId: snapshotId },
      orderBy: { sortOrder: 'asc' },
    });

    const latestVersion = await this.prisma.wireframeSnapshot.findFirst({
      where: { projectId: snapshot.projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const forked = await this.prisma.$transaction(async (tx) => {
      const newSnapshot = await tx.wireframeSnapshot.create({
        data: {
          projectId: snapshot.projectId,
          requirementSnapshotId: snapshot.requirementSnapshotId,
          userFlowSnapshotId: snapshot.userFlowSnapshotId,
          version: nextVersion,
          status: WireframeStatus.GENERATED,
          aiProvider: snapshot.aiProvider,
          aiModel: snapshot.aiModel,
          pageCount: screens.length,
          wireframeJson: snapshot.wireframeJson as Prisma.InputJsonValue,
          designSystem: snapshot.designSystem as Prisma.InputJsonValue ?? Prisma.DbNull,
          navigationFlow: snapshot.navigationFlow as Prisma.InputJsonValue ?? Prisma.DbNull,
          assumptions: snapshot.assumptions,
          sourcePrompt: instruction ?? snapshot.sourcePrompt,
          platform: snapshot.platform,
          style: snapshot.style,
          createdById: user.userId,
        },
        select: {
          id: true,
          version: true,
          status: true,
          pageCount: true,
          createdAt: true,
        },
      });

      for (const screen of screens) {
        await tx.wireframeScreen.create({
          data: {
            wireframeSnapshotId: newSnapshot.id,
            userFlowScreenId: screen.userFlowScreenId,
            name: screen.name,
            description: screen.description,
            layoutJson: screen.layoutJson as Prisma.InputJsonValue,
            sortOrder: screen.sortOrder,
            screenType: screen.screenType,
            viewportWidth: screen.viewportWidth,
            viewportHeight: screen.viewportHeight,
            screenState: screen.screenState,
            annotations: screen.annotations as Prisma.InputJsonValue ?? Prisma.DbNull,
            interactions: screen.interactions as Prisma.InputJsonValue ?? Prisma.DbNull,
            metadata: screen.metadata as Prisma.InputJsonValue ?? Prisma.DbNull,
          },
        });
      }

      return newSnapshot;
    });

    return forked;
  }

  // ─── LIST BY PROJECT ───

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

    const [wireframes, total] = await Promise.all([
      this.prisma.wireframeSnapshot.findMany({
        where,
        select: {
          id: true,
          version: true,
          status: true,
          pageCount: true,
          aiProvider: true,
          aiModel: true,
          platform: true,
          style: true,
          generationTimeMs: true,
          createdAt: true,
          createdBy: {
            select: { id: true, fullName: true, email: true },
          },
          _count: { select: { screens: true } },
        },
        orderBy: { version: 'desc' },
        skip,
        take,
      }),
      this.prisma.wireframeSnapshot.count({ where }),
    ]);

    return paginate(wireframes, total, query);
  }

  // ─── GET LATEST ───

  async getLatest(projectId: string, user: CurrentUserShape) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.requireProjectAccess(projectId, project.organizationId, user);

    const wireframe = await this.prisma.wireframeSnapshot.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        status: true,
        pageCount: true,
        wireframeJson: true,
        designSystem: true,
        navigationFlow: true,
        assumptions: true,
        aiProvider: true,
        aiModel: true,
        platform: true,
        style: true,
        generationTimeMs: true,
        createdAt: true,
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        screens: {
          select: {
            id: true,
            name: true,
            description: true,
            layoutJson: true,
            sortOrder: true,
            screenType: true,
            viewportWidth: true,
            viewportHeight: true,
            screenState: true,
            annotations: true,
            interactions: true,
            userFlowScreen: {
              select: { id: true, name: true, screenType: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!wireframe) {
      throw new NotFoundException('No wireframes found for this project');
    }

    return wireframe;
  }

  // ─── GET BY ID ───

  async getById(wireframeId: string, user: CurrentUserShape) {
    const wireframe = await this.prisma.wireframeSnapshot.findUnique({
      where: { id: wireframeId },
      select: {
        id: true,
        projectId: true,
        version: true,
        status: true,
        pageCount: true,
        wireframeJson: true,
        designSystem: true,
        navigationFlow: true,
        assumptions: true,
        aiProvider: true,
        aiModel: true,
        platform: true,
        style: true,
        generationTimeMs: true,
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
            layoutJson: true,
            sortOrder: true,
            screenType: true,
            viewportWidth: true,
            viewportHeight: true,
            screenState: true,
            annotations: true,
            interactions: true,
            userFlowScreen: {
              select: { id: true, name: true, screenType: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!wireframe) {
      throw new NotFoundException('Wireframe not found');
    }

    await this.requireProjectAccess(
      wireframe.projectId,
      wireframe.project.organizationId,
      user,
    );

    const { project: _project, projectId: _projectId, ...result } = wireframe;
    return result;
  }

  // ─── EXPORT ───

  async exportWireframe(
    projectId: string,
    wireframeSnapshotId: string | undefined,
    format: ExportFormat,
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

    const wireframe = wireframeSnapshotId
      ? await this.prisma.wireframeSnapshot.findUnique({
          where: { id: wireframeSnapshotId },
          select: {
            id: true,
            version: true,
            wireframeJson: true,
            designSystem: true,
            navigationFlow: true,
            createdAt: true,
            screens: {
              select: {
                id: true,
                name: true,
                description: true,
                layoutJson: true,
                sortOrder: true,
                screenType: true,
                viewportWidth: true,
                viewportHeight: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        })
      : await this.prisma.wireframeSnapshot.findFirst({
          where: { projectId },
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            wireframeJson: true,
            designSystem: true,
            navigationFlow: true,
            createdAt: true,
            screens: {
              select: {
                id: true,
                name: true,
                description: true,
                layoutJson: true,
                sortOrder: true,
                screenType: true,
                viewportWidth: true,
                viewportHeight: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });

    if (!wireframe) {
      throw new NotFoundException('No wireframes found for this project');
    }

    if (format === ExportFormat.JSON) {
      return {
        version: wireframe.version,
        data: {
          wireframeJson: wireframe.wireframeJson,
          designSystem: wireframe.designSystem,
          navigationFlow: wireframe.navigationFlow,
          screens: wireframe.screens,
        },
      };
    }

    const pdfBuffer = await this.generatePdf(wireframe);
    return {
      version: wireframe.version,
      data: pdfBuffer,
    };
  }

  // ─── INDUSTRY DETECTION ───

  detectIndustry(text: string): string {
    const lowerText = text.toLowerCase();

    let bestMatch = 'general';
    let bestScore = 0;

    for (const [industry, keywords] of Object.entries(INDUSTRY_PATTERNS)) {
      const score = keywords.filter((kw) => lowerText.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = industry;
      }
    }

    return bestMatch;
  }

  // ─── PRIVATE HELPERS ───

  private getViewportWidth(platform?: string | null): number {
    switch (platform) {
      case 'MOBILE': return 375;
      case 'TABLET': return 768;
      default: return 1440;
    }
  }

  private getViewportHeight(platform?: string | null): number {
    switch (platform) {
      case 'MOBILE': return 812;
      case 'TABLET': return 1024;
      default: return 900;
    }
  }

  private async getSnapshotWithAccess(snapshotId: string, user: CurrentUserShape) {
    const snapshot = await this.prisma.wireframeSnapshot.findUnique({
      where: { id: snapshotId },
      select: {
        id: true,
        projectId: true,
        requirementSnapshotId: true,
        userFlowSnapshotId: true,
        wireframeJson: true,
        designSystem: true,
        navigationFlow: true,
        assumptions: true,
        sourcePrompt: true,
        platform: true,
        style: true,
        aiProvider: true,
        aiModel: true,
        project: {
          select: { id: true, organizationId: true, name: true },
        },
      },
    });

    if (!snapshot) {
      throw new NotFoundException('Wireframe snapshot not found');
    }

    await this.requireProjectAccess(
      snapshot.projectId,
      snapshot.project.organizationId,
      user,
    );

    return snapshot;
  }

  private async getSnapshotAndScreen(
    snapshotId: string,
    screenId: string,
    user: CurrentUserShape,
  ) {
    const snapshot = await this.getSnapshotWithAccess(snapshotId, user);

    const screen = await this.prisma.wireframeScreen.findUnique({
      where: { id: screenId },
      select: {
        id: true,
        name: true,
        description: true,
        layoutJson: true,
        sortOrder: true,
        screenType: true,
        wireframeSnapshotId: true,
      },
    });

    if (!screen || screen.wireframeSnapshotId !== snapshotId) {
      throw new NotFoundException('Screen not found in this snapshot');
    }

    return { snapshot, screen };
  }

  private async generatePdf(wireframe: {
    version: number;
    wireframeJson: unknown;
    designSystem: unknown;
    createdAt: Date;
    screens: Array<{
      name: string;
      description: string | null;
      layoutJson: unknown;
      sortOrder: number;
    }>;
  }): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(24).text('Wireframe Specification', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Version: ${wireframe.version}`);
      doc.text(`Pages: ${wireframe.screens.length}`);
      doc.text(`Generated: ${wireframe.createdAt.toISOString()}`);

      if (wireframe.designSystem) {
        doc.addPage();
        doc.fontSize(18).text('Design System');
        doc.moveDown();
        doc
          .fontSize(10)
          .text(JSON.stringify(wireframe.designSystem, null, 2), {
            width: 500,
          });
      }

      for (const screen of wireframe.screens) {
        doc.addPage();
        doc.fontSize(16).text(screen.name);
        doc.moveDown(0.5);
        if (screen.description) {
          doc.fontSize(10).text(screen.description);
          doc.moveDown(0.5);
        }
        this.renderLayoutToPdf(
          doc,
          screen.layoutJson as Record<string, unknown>,
        );
      }

      doc.end();
    });
  }

  private renderLayoutToPdf(
    doc: PDFKit.PDFDocument,
    layout: Record<string, unknown>,
    indent = 0,
  ) {
    if (layout.title) {
      doc.fontSize(12).text(`${'  '.repeat(indent)}${layout.title}`);
      doc.moveDown(0.3);
    }
    const sections = (layout.sections ?? []) as Array<
      Record<string, unknown>
    >;
    for (const section of sections) {
      doc
        .fontSize(11)
        .text(
          `${'  '.repeat(indent)}[${section.name}] (${section.layout})`,
        );
      const components = (section.components ?? []) as Array<
        Record<string, unknown>
      >;
      this.renderComponentsToPdf(doc, components, indent + 1);
      doc.moveDown(0.2);
    }
  }

  private renderComponentsToPdf(
    doc: PDFKit.PDFDocument,
    components: Array<Record<string, unknown>>,
    indent: number,
  ) {
    for (const comp of components) {
      const label = comp.label ? ` "${comp.label}"` : '';
      doc
        .fontSize(9)
        .text(`${'  '.repeat(indent)}<${comp.type}>${label}`);
      const children = (comp.children ?? []) as Array<
        Record<string, unknown>
      >;
      if (children.length > 0) {
        this.renderComponentsToPdf(doc, children, indent + 1);
      }
    }
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
