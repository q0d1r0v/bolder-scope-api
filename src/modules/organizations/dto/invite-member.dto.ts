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

export enum OrganizationInviteRole {
  DEVELOPER = 'DEVELOPER',
  CLIENT = 'CLIENT',
}

export class InviteMemberDto {
  @ApiProperty({
    example: 'developer@example.com',
    description: 'Email address of the person to invite',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({
    enum: OrganizationInviteRole,
    enumName: 'OrganizationInviteRole',
    example: OrganizationInviteRole.DEVELOPER,
    description: 'Role to assign to the invited member (DEVELOPER or CLIENT)',
  })
  @IsEnum(OrganizationInviteRole)
  role!: OrganizationInviteRole;

  @ApiPropertyOptional({
    example: 'John Doe',
    minLength: 2,
    maxLength: 120,
    description:
      'Full name of the invited person (optional, can be set when accepting invite)',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;
}
