import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AuthAccountRole {
  AGENCY = 'AGENCY',
  CLIENT = 'CLIENT',
}

export class RegisterDto {
  @ApiProperty({
    example: 'founder@bolder-scope.com',
    description: 'User email address',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Str0ngP@ssword123',
    minLength: 8,
    maxLength: 128,
    description: 'User password',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({
    enum: AuthAccountRole,
    enumName: 'AuthAccountRole',
    example: AuthAccountRole.AGENCY,
    description:
      'Select whether this account is for an agency or a client organization',
  })
  @IsEnum(AuthAccountRole)
  role!: AuthAccountRole;

  @ApiProperty({
    example: 'Azizbek Tursunov',
    minLength: 2,
    maxLength: 120,
    description: 'Full name',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({
    example: 'Bolder Scope Studio',
    minLength: 2,
    maxLength: 120,
    description:
      'Optional organization name. If omitted, it will be generated from full name and role',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  organizationName?: string;
}
