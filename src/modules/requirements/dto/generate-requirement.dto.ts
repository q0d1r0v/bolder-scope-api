import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class GenerateRequirementDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  sourceInputId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instruction?: string;
}
