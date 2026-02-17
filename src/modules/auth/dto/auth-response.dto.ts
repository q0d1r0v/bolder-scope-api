import { ApiProperty } from '@nestjs/swagger';
import { OrganizationRole, OrganizationType, SystemRole, UserStatus } from '@prisma/client';

class AuthUserDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f2f4ceb-56cc-4f2b-a0b1-e7fa138f7d52',
    description: 'User unique identifier',
  })
  id!: string;

  @ApiProperty({
    example: 'founder@bolder-scope.com',
    description: 'User email',
  })
  email!: string;

  @ApiProperty({
    example: 'Azizbek Tursunov',
    description: 'User full name',
  })
  fullName!: string;

  @ApiProperty({
    enum: SystemRole,
    enumName: 'SystemRole',
    example: SystemRole.USER,
    description: 'System-wide role (SUPER_ADMIN or USER)',
  })
  systemRole!: SystemRole;

  @ApiProperty({
    enum: UserStatus,
    enumName: 'UserStatus',
    example: UserStatus.ACTIVE,
    description: 'User account status',
  })
  status!: UserStatus;

  @ApiProperty({
    example: false,
    description: 'Whether the email is verified',
  })
  isEmailVerified!: boolean;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    example: '2026-02-16T11:34:58.000Z',
    description: 'Last successful login timestamp',
  })
  lastLoginAt!: string | null;
}

class AuthTokensDto {
  @ApiProperty({
    example: 'Bearer',
    description: 'Token type for Authorization header',
  })
  tokenType!: 'Bearer';

  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZjJmNGNlYi01NmNjLTRmMmItYTBiMS1lN2ZhMTM4ZjdkNTIiLCJlbWFpbCI6ImZvdW5kZXJAYm9sZGVyLXNjb3BlLmNvbSIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3MDgwODAwMDAsImV4cCI6MTcwODA4MDkwMH0.q4Wj4druqv6c5TRfHTM-4bLzAo8iA2vXVDsI6P5YVfU',
    description: 'Short-lived access token (JWT)',
  })
  accessToken!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-02-16T11:49:58.000Z',
    description: 'Access token expiration time',
  })
  accessTokenExpiresAt!: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479.uXo3QxUkPKW4fFJHk1fQb7j9P5r1w2Qxw5nMg7xQhR2',
    description: 'Long-lived refresh token',
  })
  refreshToken!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-03-18T11:34:58.000Z',
    description: 'Refresh token expiration time',
  })
  refreshTokenExpiresAt!: string;
}

class AuthContextDto {
  @ApiProperty({
    format: 'uuid',
    example: '8e23f122-2f9d-4b2a-8f28-5f8e2454c8db',
    description: 'Active organization identifier',
  })
  organizationId!: string;

  @ApiProperty({
    example: 'Bolder Scope Studio',
    description: 'Active organization name',
  })
  organizationName!: string;

  @ApiProperty({
    example: 'bolder-scope-studio',
    description: 'Active organization slug',
  })
  organizationSlug!: string;

  @ApiProperty({
    enum: OrganizationType,
    enumName: 'OrganizationType',
    example: OrganizationType.AGENCY,
    description: 'Organization type used for access context',
  })
  organizationType!: OrganizationType;

  @ApiProperty({
    enum: OrganizationRole,
    enumName: 'OrganizationRole',
    example: OrganizationRole.OWNER,
    description: 'Role of the authenticated user in active organization',
  })
  organizationRole!: OrganizationRole;
}

export class AuthResponseDto {
  @ApiProperty({
    type: AuthUserDto,
    description: 'Authenticated user payload',
  })
  user!: AuthUserDto;

  @ApiProperty({
    type: AuthTokensDto,
    description: 'Issued token pair',
  })
  tokens!: AuthTokensDto;

  @ApiProperty({
    type: AuthContextDto,
    nullable: true,
    description: 'Current organization and role context for authorization',
  })
  context!: AuthContextDto | null;
}

export class LogoutResponseDto {
  @ApiProperty({
    example: 'Logged out',
    description: 'Logout operation result',
  })
  message!: string;
}

export class VerifyEmailResponseDto {
  @ApiProperty({
    example: 'Email verified successfully',
    description: 'Email verification result',
  })
  message!: string;
}
