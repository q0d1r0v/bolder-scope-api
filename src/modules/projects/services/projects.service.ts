import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InviteStatus,
  ProjectEventType,
  ProjectRole,
  ProjectStatus,
  SystemRole,
} from '@prisma/client';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import {
  buildPrismaPagination,
  paginate,
} from '@/common/helpers/pagination.helper';
import { PrismaService } from '@/prisma/prisma.service';
import { AddProjectInputDto } from '@/modules/projects/dto/add-project-input.dto';
import { CreateProjectDto } from '@/modules/projects/dto/create-project.dto';
import { UpdateProjectStatusDto } from '@/modules/projects/dto/update-project-status.dto';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(payload: CreateProjectDto, user: CurrentUserShape) {
    await this.requireOrgMembership(payload.organizationId, user);

    const result = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          organizationId: payload.organizationId,
          clientOrganizationId: payload.clientOrganizationId ?? null,
          createdById: user.userId,
          name: payload.name,
          description: payload.description ?? null,
          sourceType: payload.sourceType,
        },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          stage: true,
          sourceType: true,
          currency: true,
          createdAt: true,
        },
      });

      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: user.userId,
          role: ProjectRole.OWNER,
        },
      });

      await tx.projectActivity.create({
        data: {
          organizationId: payload.organizationId,
          projectId: project.id,
          actorUserId: user.userId,
          eventType: ProjectEventType.PROJECT_CREATED,
          summary: `Project "${payload.name}" created`,
        },
      });

      return project;
    });

    return result;
  }

  async findAll(user: CurrentUserShape, query: PaginationQueryDto) {
    const { skip, take } = buildPrismaPagination(query);

    const where = this.buildProjectAccessWhere(user);

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
          updatedAt: true,
          organization: {
            select: { id: true, name: true, slug: true },
          },
          _count: {
            select: {
              inputs: true,
              requirements: true,
              estimates: true,
              members: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.project.count({ where }),
    ]);

    return paginate(projects, total, query);
  }

  async findOne(projectId: string, user: CurrentUserShape) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        stage: true,
        sourceType: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
        archivedAt: true,
        organizationId: true,
        organization: {
          select: { id: true, name: true, slug: true, type: true },
        },
        clientOrganization: {
          select: { id: true, name: true, slug: true },
        },
        createdBy: {
          select: { id: true, email: true, fullName: true },
        },
        _count: {
          select: {
            inputs: true,
            requirements: true,
            estimates: true,
            members: true,
            features: true,
            techRecommendations: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.requireProjectAccess(projectId, project.organizationId, user);

    return project;
  }

  async findInputs(
    projectId: string,
    user: CurrentUserShape,
    query: PaginationQueryDto,
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

    const [inputs, total] = await Promise.all([
      this.prisma.projectInput.findMany({
        where,
        select: {
          id: true,
          sourceType: true,
          rawText: true,
          transcriptText: true,
          languageCode: true,
          durationSeconds: true,
          createdAt: true,
          author: {
            select: { id: true, email: true, fullName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.projectInput.count({ where }),
    ]);

    return paginate(inputs, total, query);
  }

  async addInput(
    projectId: string,
    payload: AddProjectInputDto,
    user: CurrentUserShape,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true, status: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.status === ProjectStatus.ARCHIVED) {
      throw new BadRequestException('Cannot add inputs to an archived project');
    }

    await this.requireProjectAccess(projectId, project.organizationId, user);

    const input = await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectInput.create({
        data: {
          projectId,
          authorId: user.userId,
          sourceType: payload.sourceType,
          rawText: payload.rawText ?? null,
          transcriptText: payload.transcriptText ?? null,
          voiceAssetId: payload.voiceAssetId ?? null,
          languageCode: payload.languageCode ?? null,
          durationSeconds: payload.durationSeconds ?? null,
        },
        select: {
          id: true,
          sourceType: true,
          rawText: true,
          transcriptText: true,
          languageCode: true,
          durationSeconds: true,
          createdAt: true,
        },
      });

      await tx.projectActivity.create({
        data: {
          organizationId: project.organizationId,
          projectId,
          actorUserId: user.userId,
          eventType: ProjectEventType.INPUT_ADDED,
          summary: `Input added (${payload.sourceType})`,
          payload: { inputId: created.id, sourceType: payload.sourceType },
        },
      });

      return created;
    });

    return input;
  }

  async updateStatus(
    projectId: string,
    payload: UpdateProjectStatusDto,
    user: CurrentUserShape,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true, status: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.requireProjectRole(projectId, project.organizationId, user, [
      ProjectRole.OWNER,
      ProjectRole.MANAGER,
    ]);

    const data: Record<string, unknown> = {
      status: payload.status,
    };

    if (payload.stage) {
      data.stage = payload.stage;
    }

    if (String(payload.status) === String(ProjectStatus.ARCHIVED)) {
      data.archivedAt = new Date();
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.project.update({
        where: { id: projectId },
        data,
        select: {
          id: true,
          status: true,
          stage: true,
          archivedAt: true,
          updatedAt: true,
        },
      });

      await tx.projectActivity.create({
        data: {
          organizationId: project.organizationId,
          projectId,
          actorUserId: user.userId,
          eventType: ProjectEventType.STATUS_CHANGED,
          summary: `Status changed to ${payload.status}`,
          payload: {
            previousStatus: project.status,
            newStatus: payload.status,
            stage: payload.stage ?? null,
          },
        },
      });

      return result;
    });

    return updated;
  }

  private async requireOrgMembership(
    organizationId: string,
    user: CurrentUserShape,
  ) {
    if (user.systemRole === SystemRole.SUPER_ADMIN) {
      return;
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.userId } },
      select: { id: true, inviteStatus: true },
    });

    if (!membership || membership.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You are not a member of this organization');
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
      return projectMember;
    }

    const orgMember = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.userId } },
      select: { role: true, inviteStatus: true },
    });

    if (!orgMember || orgMember.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return orgMember;
  }

  private async requireProjectRole(
    projectId: string,
    organizationId: string,
    user: CurrentUserShape,
    allowedRoles: ProjectRole[],
  ) {
    if (user.systemRole === SystemRole.SUPER_ADMIN) {
      return;
    }

    const projectMember = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.userId } },
      select: { role: true },
    });

    if (projectMember && allowedRoles.includes(projectMember.role)) {
      return;
    }

    const orgMember = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.userId } },
      select: { role: true, inviteStatus: true },
    });

    if (
      orgMember &&
      orgMember.inviteStatus === InviteStatus.ACCEPTED &&
      (orgMember.role === 'OWNER' || orgMember.role === 'ADMIN')
    ) {
      return;
    }

    throw new ForbiddenException(
      'You do not have the required role for this action',
    );
  }

  private buildProjectAccessWhere(user: CurrentUserShape) {
    if (user.systemRole === SystemRole.SUPER_ADMIN) {
      return {};
    }

    return {
      OR: [
        { members: { some: { userId: user.userId } } },
        {
          organization: {
            memberships: {
              some: {
                userId: user.userId,
                inviteStatus: InviteStatus.ACCEPTED,
              },
            },
          },
        },
      ],
    };
  }
}
