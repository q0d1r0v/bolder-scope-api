import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum EstimateSectionName {
  PROJECT_OVERVIEW = 'projectOverview',
  SCOPE = 'scope',
  TECHNICAL_ARCHITECTURE = 'technicalArchitecture',
  WBS = 'wbs',
  TIMELINE = 'timeline',
  COST_CALCULATION = 'costCalculation',
  ASSUMPTIONS = 'assumptions',
  CHANGE_MANAGEMENT = 'changeManagement',
  ACCEPTANCE_CRITERIA = 'acceptanceCriteria',
  ADDITIONAL_SECTIONS = 'additionalSections',
}

export class RegenerateEstimateSectionDto {
  @IsUUID()
  estimateSnapshotId!: string;

  @IsEnum(EstimateSectionName)
  section!: EstimateSectionName;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instruction?: string;
}
