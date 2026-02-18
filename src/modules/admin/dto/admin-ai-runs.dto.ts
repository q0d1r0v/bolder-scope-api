import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AiProvider, AiRunStatus, AiTaskType } from '@prisma/client';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

export class AdminAiRunsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AiRunStatus, enumName: 'AiRunStatus', description: 'Filter by run status' })
  @IsOptional()
  @IsEnum(AiRunStatus)
  status?: AiRunStatus;

  @ApiPropertyOptional({ enum: AiTaskType, enumName: 'AiTaskType', description: 'Filter by task type' })
  @IsOptional()
  @IsEnum(AiTaskType)
  taskType?: AiTaskType;

  @ApiPropertyOptional({ enum: AiProvider, enumName: 'AiProvider', description: 'Filter by AI provider' })
  @IsOptional()
  @IsEnum(AiProvider)
  provider?: AiProvider;

  @ApiPropertyOptional({ description: 'Filter by organization ID' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
