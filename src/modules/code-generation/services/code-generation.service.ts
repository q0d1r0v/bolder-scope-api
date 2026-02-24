import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AiProvider,
  CodeGenFileType,
  CodeGenStack,
  CodeGenStatus,
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
import { GenerateCodeDto } from '@/modules/code-generation/dto/generate-code.dto';
import {
  CodeExportFormat,
} from '@/modules/code-generation/dto/export-code.dto';

const VALID_FILE_TYPES: Set<string> = new Set(
  Object.values(CodeGenFileType),
);

@Injectable()
export class CodeGenerationService {
  private readonly logger = new Logger(CodeGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async generate(payload: GenerateCodeDto, user: CurrentUserShape) {
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

    // Get requirement snapshot
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

    // Get features
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
        'No features found. Generate requirements with features first.',
      );
    }

    // Get tech stack recommendation
    const techStack = payload.techStackRecommendationId
      ? await this.prisma.techStackRecommendation.findUnique({
          where: { id: payload.techStackRecommendationId },
          select: {
            id: true,
            frontend: true,
            backend: true,
            database: true,
            infrastructure: true,
          },
        })
      : await this.prisma.techStackRecommendation.findFirst({
          where: { projectId: payload.projectId },
          orderBy: { version: 'desc' },
          select: {
            id: true,
            frontend: true,
            backend: true,
            database: true,
            infrastructure: true,
          },
        });

    if (!techStack) {
      throw new BadRequestException(
        'No tech stack recommendation found. Generate tech stack first.',
      );
    }

    // Get wireframe snapshot + screens
    const wireframeSnapshot = payload.wireframeSnapshotId
      ? await this.prisma.wireframeSnapshot.findUnique({
          where: { id: payload.wireframeSnapshotId },
          select: { id: true },
        })
      : await this.prisma.wireframeSnapshot.findFirst({
          where: { projectId: payload.projectId },
          orderBy: { version: 'desc' },
          select: { id: true },
        });

    if (!wireframeSnapshot) {
      throw new BadRequestException(
        'No wireframe found. Generate wireframes first.',
      );
    }

    const wireframeScreens = await this.prisma.wireframeScreen.findMany({
      where: { wireframeSnapshotId: wireframeSnapshot.id },
      select: {
        id: true,
        name: true,
        description: true,
        layoutJson: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    if (wireframeScreens.length === 0) {
      throw new BadRequestException(
        'No wireframe screens found. Generate wireframes first.',
      );
    }

    // Call AI
    const aiContext = {
      organizationId: project.organizationId,
      projectId: project.id,
      userId: user.userId,
    };

    const { result: codeResult, aiRunId } =
      await this.aiService.generateCode(
        requirementSnapshot.structuredJson as Record<string, unknown>,
        features.map((f) => ({
          title: f.title,
          description: f.description ?? '',
          priority: f.priority,
          complexity: f.complexity ?? 'M',
        })),
        {
          frontend: techStack.frontend,
          backend: techStack.backend,
          database: techStack.database,
          infrastructure: techStack.infrastructure,
        },
        wireframeScreens.map((s) => ({
          name: s.name,
          description: s.description ?? '',
          layoutJson: s.layoutJson,
        })),
        payload.stack,
        aiContext,
      );

    // Version management
    const latestVersion = await this.prisma.codeGenSnapshot.findFirst({
      where: { projectId: payload.projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    // Create snapshot + files in transaction
    const snapshot = await this.prisma.$transaction(async (tx) => {
      const created = await tx.codeGenSnapshot.create({
        data: {
          projectId: payload.projectId,
          requirementSnapshotId: requirementSnapshot.id,
          wireframeSnapshotId: wireframeSnapshot.id,
          techStackRecommendationId: techStack.id,
          version: nextVersion,
          status: CodeGenStatus.GENERATED,
          stack: payload.stack as CodeGenStack,
          aiProvider: AiProvider.CLAUDE,
          fileCount: codeResult.files.length,
          codeJson: codeResult as object,
          projectStructure: codeResult.projectStructure as object,
          assumptions: codeResult.assumptions ?? null,
          createdById: user.userId,
        },
        select: {
          id: true,
          version: true,
          status: true,
          stack: true,
          fileCount: true,
          projectStructure: true,
          assumptions: true,
          createdAt: true,
        },
      });

      // Create individual file records
      for (const [index, fileData] of codeResult.files.entries()) {
        const fileType = VALID_FILE_TYPES.has(fileData.fileType)
          ? (fileData.fileType as CodeGenFileType)
          : CodeGenFileType.UTIL;

        await tx.codeGenFile.create({
          data: {
            codeGenSnapshotId: created.id,
            filePath: fileData.filePath,
            fileName: fileData.fileName,
            fileType,
            language: fileData.language,
            content: fileData.content,
            description: fileData.description ?? null,
            sortOrder: index,
          },
        });
      }

      // Update project stage
      await tx.project.update({
        where: { id: payload.projectId },
        data: { stage: ProjectStage.CODE_GENERATION },
      });

      // Log activity
      await tx.projectActivity.create({
        data: {
          organizationId: project.organizationId,
          projectId: payload.projectId,
          actorUserId: user.userId,
          eventType: ProjectEventType.CODE_GENERATED,
          summary: `Code generation v${nextVersion} completed with ${codeResult.files.length} files (${payload.stack})`,
          payload: {
            codeGenSnapshotId: created.id,
            aiRunId,
            fileCount: codeResult.files.length,
            stack: payload.stack,
          },
        },
      });

      return created;
    });

    // Fetch created files for response
    const files = await this.prisma.codeGenFile.findMany({
      where: { codeGenSnapshotId: snapshot.id },
      select: {
        id: true,
        filePath: true,
        fileName: true,
        fileType: true,
        language: true,
        description: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      ...snapshot,
      files,
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

    const [snapshots, total] = await Promise.all([
      this.prisma.codeGenSnapshot.findMany({
        where,
        select: {
          id: true,
          version: true,
          status: true,
          stack: true,
          fileCount: true,
          aiProvider: true,
          createdAt: true,
          createdBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
        orderBy: { version: 'desc' },
        skip,
        take,
      }),
      this.prisma.codeGenSnapshot.count({ where }),
    ]);

    return paginate(snapshots, total, query);
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

    const snapshot = await this.prisma.codeGenSnapshot.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        status: true,
        stack: true,
        fileCount: true,
        projectStructure: true,
        assumptions: true,
        aiProvider: true,
        createdAt: true,
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        files: {
          select: {
            id: true,
            filePath: true,
            fileName: true,
            fileType: true,
            language: true,
            description: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!snapshot) {
      throw new NotFoundException(
        'No code generation snapshots found for this project',
      );
    }

    return snapshot;
  }

  async getById(codeGenId: string, user: CurrentUserShape) {
    const snapshot = await this.prisma.codeGenSnapshot.findUnique({
      where: { id: codeGenId },
      select: {
        id: true,
        projectId: true,
        version: true,
        status: true,
        stack: true,
        fileCount: true,
        projectStructure: true,
        assumptions: true,
        aiProvider: true,
        createdAt: true,
        project: {
          select: { id: true, organizationId: true },
        },
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        files: {
          select: {
            id: true,
            filePath: true,
            fileName: true,
            fileType: true,
            language: true,
            description: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!snapshot) {
      throw new NotFoundException('Code generation snapshot not found');
    }

    await this.requireProjectAccess(
      snapshot.projectId,
      snapshot.project.organizationId,
      user,
    );

    const { project: _project, projectId: _projectId, ...result } = snapshot;
    return result;
  }

  async getFiles(codeGenId: string, user: CurrentUserShape) {
    const snapshot = await this.prisma.codeGenSnapshot.findUnique({
      where: { id: codeGenId },
      select: {
        id: true,
        projectId: true,
        project: { select: { organizationId: true } },
      },
    });

    if (!snapshot) {
      throw new NotFoundException('Code generation snapshot not found');
    }

    await this.requireProjectAccess(
      snapshot.projectId,
      snapshot.project.organizationId,
      user,
    );

    return this.prisma.codeGenFile.findMany({
      where: { codeGenSnapshotId: codeGenId },
      select: {
        id: true,
        filePath: true,
        fileName: true,
        fileType: true,
        language: true,
        content: true,
        description: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getFileById(
    codeGenId: string,
    fileId: string,
    user: CurrentUserShape,
  ) {
    const snapshot = await this.prisma.codeGenSnapshot.findUnique({
      where: { id: codeGenId },
      select: {
        id: true,
        projectId: true,
        project: { select: { organizationId: true } },
      },
    });

    if (!snapshot) {
      throw new NotFoundException('Code generation snapshot not found');
    }

    await this.requireProjectAccess(
      snapshot.projectId,
      snapshot.project.organizationId,
      user,
    );

    const file = await this.prisma.codeGenFile.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        filePath: true,
        fileName: true,
        fileType: true,
        language: true,
        content: true,
        description: true,
        sortOrder: true,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  async exportCode(
    projectId: string,
    codeGenSnapshotId: string | undefined,
    format: CodeExportFormat,
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

    const snapshot = codeGenSnapshotId
      ? await this.prisma.codeGenSnapshot.findUnique({
          where: { id: codeGenSnapshotId },
          select: {
            id: true,
            version: true,
            stack: true,
            projectStructure: true,
            createdAt: true,
            files: {
              select: {
                filePath: true,
                fileName: true,
                fileType: true,
                language: true,
                content: true,
                description: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        })
      : await this.prisma.codeGenSnapshot.findFirst({
          where: { projectId },
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            stack: true,
            projectStructure: true,
            createdAt: true,
            files: {
              select: {
                filePath: true,
                fileName: true,
                fileType: true,
                language: true,
                content: true,
                description: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });

    if (!snapshot) {
      throw new NotFoundException(
        'No code generation snapshots found for this project',
      );
    }

    if (format === CodeExportFormat.JSON) {
      return {
        version: snapshot.version,
        data: {
          stack: snapshot.stack,
          projectStructure: snapshot.projectStructure,
          files: snapshot.files,
        },
      };
    }

    // ZIP export
    const zipBuffer = await this.generateZip(snapshot.files);
    return {
      version: snapshot.version,
      data: zipBuffer,
    };
  }

  private async generateZip(
    files: Array<{
      filePath: string;
      content: string;
    }>,
  ): Promise<Buffer> {
    const archiver = (await import('archiver')).default;

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      for (const file of files) {
        archive.append(file.content, { name: file.filePath });
      }

      archive.finalize();
    });
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
      where: {
        organizationId_userId: { organizationId, userId: user.userId },
      },
      select: { inviteStatus: true },
    });

    if (!orgMember || orgMember.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You do not have access to this project');
    }
  }
}
