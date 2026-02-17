import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export enum RequirementStatusInput {
  DRAFT = 'DRAFT',
  GENERATED = 'GENERATED',
  REVIEWED = 'REVIEWED',
  APPROVED = 'APPROVED',
}

export class UpdateRequirementDto {
  @IsObject()
  structuredJson!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  assumptions?: string;

  @IsOptional()
  @IsEnum(RequirementStatusInput)
  status?: RequirementStatusInput;
}
