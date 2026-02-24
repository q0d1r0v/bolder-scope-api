import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CodeGenStackDto {
  NEXTJS_NESTJS = 'NEXTJS_NESTJS',
  NEXTJS_EXPRESS = 'NEXTJS_EXPRESS',
  REACT_NESTJS = 'REACT_NESTJS',
  REACT_EXPRESS = 'REACT_EXPRESS',
}

export class GenerateCodeDto {
  @ApiProperty({ description: 'Project ID' })
  @IsUUID()
  projectId!: string;

  @ApiPropertyOptional({ description: 'Specific requirement snapshot ID (uses latest if omitted)' })
  @IsOptional()
  @IsUUID()
  requirementSnapshotId?: string;

  @ApiPropertyOptional({ description: 'Specific wireframe snapshot ID (uses latest if omitted)' })
  @IsOptional()
  @IsUUID()
  wireframeSnapshotId?: string;

  @ApiPropertyOptional({ description: 'Specific tech stack recommendation ID (uses latest if omitted)' })
  @IsOptional()
  @IsUUID()
  techStackRecommendationId?: string;

  @ApiProperty({ enum: CodeGenStackDto, description: 'Target technology stack' })
  @IsEnum(CodeGenStackDto)
  stack!: CodeGenStackDto;
}
