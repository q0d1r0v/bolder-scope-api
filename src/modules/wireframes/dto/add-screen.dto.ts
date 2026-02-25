import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddScreenDto {
  @ApiProperty({
    description: 'Name of the new screen',
    example: 'SettingsPage',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Description of what the screen should contain',
    example: 'Settings page with profile, notifications, and billing sections',
    minLength: 5,
    maxLength: 500,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  description!: string;

  @ApiPropertyOptional({
    description: 'Type of screen',
    example: 'page',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  screenType?: string;

  @ApiPropertyOptional({
    description: 'Additional instruction for AI generation',
    example: 'Use sidebar navigation with tabs for each section',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instruction?: string;
}
