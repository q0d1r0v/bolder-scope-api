import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { buildPrismaPagination, paginate } from '@/common/helpers/pagination.helper';
import { AdminAiRunsQueryDto } from '@/modules/admin/dto/admin-ai-runs.dto';

@Injectable()
export class AdminAiRunsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AdminAiRunsQueryDto) {
    const where: Prisma.AiRunWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.taskType) {
      where.taskType = query.taskType;
    }

    if (query.provider) {
      where.provider = query.provider;
    }

    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    const { skip, take } = buildPrismaPagination(query);

    const [aiRuns, total] = await Promise.all([
      this.prisma.aiRun.findMany({
        where,
        select: {
          id: true,
          provider: true,
          model: true,
          taskType: true,
          status: true,
          inputTokens: true,
          outputTokens: true,
          totalCostUsd: true,
          latencyMs: true,
          createdAt: true,
          organization: {
            select: { id: true, name: true, slug: true },
          },
          project: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.aiRun.count({ where }),
    ]);

    return paginate(aiRuns, total, query);
  }

  async findOne(aiRunId: string) {
    const aiRun = await this.prisma.aiRun.findUnique({
      where: { id: aiRunId },
      select: {
        id: true,
        provider: true,
        model: true,
        taskType: true,
        status: true,
        inputTokens: true,
        outputTokens: true,
        totalCostUsd: true,
        latencyMs: true,
        errorMessage: true,
        requestPayload: true,
        responsePayload: true,
        createdAt: true,
        organization: {
          select: { id: true, name: true, slug: true, type: true },
        },
        project: {
          select: { id: true, name: true, status: true },
        },
        initiatedBy: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });

    if (!aiRun) {
      throw new NotFoundException('AI run not found');
    }

    return aiRun;
  }
}
