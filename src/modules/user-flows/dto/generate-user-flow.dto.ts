import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class GenerateUserFlowDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  requirementSnapshotId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instruction?: string;
}
