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

@Injectable()
export class WireframesService {
  private readonly logger = new Logger(WireframesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async generate(payload: GenerateWireframeDto, user: CurrentUserShape) {
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

    const snapshot = await this.prisma.$transaction(async (tx) => {
      const created = await tx.wireframeSnapshot.create({
        data: {
          projectId: payload.projectId,
          requirementSnapshotId: requirementSnapshot.id,
          userFlowSnapshotId: userFlowSnapshot.id,
          version: nextVersion,
          status: WireframeStatus.GENERATED,
          aiProvider: AiProvider.CLAUDE,
          pageCount: wireframeResult.screens.length,
          wireframeJson: wireframeResult as object,
          designSystem: wireframeResult.designSystem as object,
          assumptions: wireframeResult.assumptions ?? null,
          createdById: user.userId,
        },
        select: {
          id: true,
          version: true,
          status: true,
          pageCount: true,
          designSystem: true,
          assumptions: true,
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
            layoutJson: true,
            sortOrder: true,
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
            layoutJson: true,
            sortOrder: true,
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
            createdAt: true,
            screens: {
              select: {
                id: true,
                name: true,
                description: true,
                layoutJson: true,
                sortOrder: true,
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
            createdAt: true,
            screens: {
              select: {
                id: true,
                name: true,
                description: true,
                layoutJson: true,
                sortOrder: true,
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
