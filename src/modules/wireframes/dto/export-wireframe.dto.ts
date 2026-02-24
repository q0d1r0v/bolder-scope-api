import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum ExportFormat {
  JSON = 'JSON',
  PDF = 'PDF',
}

export class ExportWireframeDto {
  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @IsOptional()
  @IsUUID()
  wireframeSnapshotId?: string;
}
