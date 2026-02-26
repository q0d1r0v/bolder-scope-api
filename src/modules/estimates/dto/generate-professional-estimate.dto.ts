import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class GenerateProfessionalEstimateDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  requirementSnapshotId?: string;

  @IsOptional()
  @IsUUID()
  techStackRecommendationId?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  targetCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instruction?: string;
}
