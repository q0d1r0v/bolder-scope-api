import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrganizationStatus, OrganizationType } from '@prisma/client';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

export class AdminOrganizationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrganizationType, enumName: 'OrganizationType', description: 'Filter by organization type' })
  @IsOptional()
  @IsEnum(OrganizationType)
  type?: OrganizationType;

  @ApiPropertyOptional({ enum: OrganizationStatus, enumName: 'OrganizationStatus', description: 'Filter by status' })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @ApiPropertyOptional({ description: 'Search by name or slug', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class AdminUpdateOrganizationDto {
  @ApiPropertyOptional({ enum: OrganizationStatus, enumName: 'OrganizationStatus', description: 'Update organization status' })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;
}
