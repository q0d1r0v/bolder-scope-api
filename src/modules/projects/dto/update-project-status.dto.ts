import { IsEnum, IsOptional } from 'class-validator';

export enum ProjectStatusInput {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ESTIMATE_READY = 'ESTIMATE_READY',
  APPROVED = 'APPROVED',
  ARCHIVED = 'ARCHIVED',
}

export enum ProjectStageInput {
  REQUIREMENT_DISCOVERY = 'REQUIREMENT_DISCOVERY',
  FEATURE_DEFINITION = 'FEATURE_DEFINITION',
  ESTIMATION = 'ESTIMATION',
  REVIEW = 'REVIEW',
}

export class UpdateProjectStatusDto {
  @IsEnum(ProjectStatusInput)
  status!: ProjectStatusInput;

  @IsOptional()
  @IsEnum(ProjectStageInput)
  stage?: ProjectStageInput;
}
