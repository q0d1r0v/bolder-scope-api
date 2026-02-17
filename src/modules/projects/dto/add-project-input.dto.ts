import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum InputSourceTypeInput {
  TEXT = 'TEXT',
  VOICE = 'VOICE',
  FORM = 'FORM',
}

export class AddProjectInputDto {
  @IsEnum(InputSourceTypeInput)
  sourceType!: InputSourceTypeInput;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  rawText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  transcriptText?: string;

  @IsOptional()
  @IsUUID()
  voiceAssetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  languageCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  durationSeconds?: number;
}
