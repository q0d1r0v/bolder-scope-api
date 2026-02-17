import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export enum AssetKindInput {
  VOICE_INPUT = 'VOICE_INPUT',
  WIREFRAME_EXPORT = 'WIREFRAME_EXPORT',
  ATTACHMENT = 'ATTACHMENT',
}

export class CreateUploadUrlDto {
  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @IsEnum(AssetKindInput)
  kind!: AssetKindInput;
}
