import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CodeExportFormat {
  ZIP = 'ZIP',
  JSON = 'JSON',
}

export class ExportCodeDto {
  @ApiProperty({ enum: CodeExportFormat, description: 'Export format' })
  @IsEnum(CodeExportFormat)
  format!: CodeExportFormat;

  @ApiPropertyOptional({ description: 'Specific code gen snapshot ID (uses latest if omitted)' })
  @IsOptional()
  @IsUUID()
  codeGenSnapshotId?: string;
}
