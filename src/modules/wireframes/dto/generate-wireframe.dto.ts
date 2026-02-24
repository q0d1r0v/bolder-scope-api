import { IsOptional, IsUUID } from 'class-validator';

export class GenerateWireframeDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  requirementSnapshotId?: string;

  @IsOptional()
  @IsUUID()
  userFlowSnapshotId?: string;
}
