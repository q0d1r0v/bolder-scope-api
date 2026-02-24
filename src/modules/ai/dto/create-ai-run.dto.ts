import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum AiProviderInput {
  OPENAI = 'OPENAI',
  CLAUDE = 'CLAUDE',
  HYBRID = 'HYBRID',
  RULES_ENGINE = 'RULES_ENGINE',
}

export enum AiTaskTypeInput {
  REQUIREMENT_STRUCTURING = 'REQUIREMENT_STRUCTURING',
  FEATURE_EXTRACTION = 'FEATURE_EXTRACTION',
  TIMELINE_ESTIMATION = 'TIMELINE_ESTIMATION',
  COST_ESTIMATION = 'COST_ESTIMATION',
  TECH_STACK_RECOMMENDATION = 'TECH_STACK_RECOMMENDATION',
  USER_FLOW_GENERATION = 'USER_FLOW_GENERATION',
  WIREFRAME_GENERATION = 'WIREFRAME_GENERATION',
}

export class CreateAiRunDto {
  @IsEnum(AiProviderInput)
  provider!: AiProviderInput;

  @IsEnum(AiTaskTypeInput)
  taskType!: AiTaskTypeInput;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  requirementSnapshotId?: string;

  @IsOptional()
  @IsUUID()
  estimateSnapshotId?: string;

  @IsOptional()
  @IsUUID()
  userFlowSnapshotId?: string;

  @IsOptional()
  @IsUUID()
  wireframeSnapshotId?: string;
}
