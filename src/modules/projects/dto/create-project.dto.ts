import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export enum ProjectSourceTypeInput {
  TEXT = 'TEXT',
  VOICE = 'VOICE',
  MIXED = 'MIXED',
}

export class CreateProjectDto {
  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(ProjectSourceTypeInput)
  sourceType!: ProjectSourceTypeInput;
}
