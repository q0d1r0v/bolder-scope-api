import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendTransactionalEmailDto {
  @ApiProperty({
    example: 'founder@bolder-scope.com',
    description: 'Recipient email address',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  toEmail!: string;

  @ApiProperty({
    example: 'AUTH_EMAIL_VERIFICATION',
    maxLength: 120,
    description: 'Template identifier',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  templateKey!: string;

  @ApiPropertyOptional({
    example: 'Verify your email to activate Bolder Scope',
    maxLength: 240,
    description: 'Optional subject override',
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  subject?: string;

  @ApiPropertyOptional({
    example: '<p>Hello from Bolder Scope</p>',
    description: 'Optional HTML body override',
  })
  @IsOptional()
  @IsString()
  html?: string;

  @ApiPropertyOptional({
    example: 'Hello from Bolder Scope',
    description: 'Optional plain-text body override',
  })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional organization context for delivery logging',
  })
  @IsOptional()
  @IsUUID('4')
  organizationId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional user context for delivery logging',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({
    description: 'Template payload',
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
