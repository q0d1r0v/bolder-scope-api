import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class GenerateEstimateDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  requirementSnapshotId?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  targetCurrency?: string;
}
