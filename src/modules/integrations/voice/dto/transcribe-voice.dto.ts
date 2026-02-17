import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TranscribeVoiceDto {
  @IsUUID()
  projectId!: string;

  @IsUUID()
  fileAssetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  languageCode?: string;
}
