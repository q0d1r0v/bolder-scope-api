import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SystemRole, UserStatus } from '@prisma/client';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

export class AdminUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UserStatus, enumName: 'UserStatus', description: 'Filter by user status' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: SystemRole, enumName: 'SystemRole', description: 'Filter by system role' })
  @IsOptional()
  @IsEnum(SystemRole)
  systemRole?: SystemRole;

  @ApiPropertyOptional({ description: 'Search by email or full name', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class AdminUpdateUserDto {
  @ApiPropertyOptional({ enum: UserStatus, enumName: 'UserStatus', description: 'Update user status' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: SystemRole, enumName: 'SystemRole', description: 'Update system role' })
  @IsOptional()
  @IsEnum(SystemRole)
  systemRole?: SystemRole;
}
