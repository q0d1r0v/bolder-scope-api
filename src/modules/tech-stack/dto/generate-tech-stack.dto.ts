import { IsOptional, IsUUID } from 'class-validator';

export class GenerateTechStackDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  requirementSnapshotId?: string;
}
