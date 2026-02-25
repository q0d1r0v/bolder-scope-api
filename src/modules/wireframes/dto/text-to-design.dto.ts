import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DesignPlatform {
  WEB = 'WEB',
  MOBILE = 'MOBILE',
  TABLET = 'TABLET',
}

export enum DesignStyle {
  MODERN = 'MODERN',
  MINIMAL = 'MINIMAL',
  CORPORATE = 'CORPORATE',
  PLAYFUL = 'PLAYFUL',
}

export class TextToDesignDto {
  @ApiProperty({ description: 'Project ID to associate the design with' })
  @IsUUID()
  projectId!: string;

  @ApiProperty({
    description: 'Text description of the desired UI design',
    example:
      'E-commerce mobile app with login, product catalog, cart, and checkout',
    minLength: 10,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  prompt!: string;

  @ApiPropertyOptional({
    enum: DesignPlatform,
    enumName: 'DesignPlatform',
    default: DesignPlatform.WEB,
    description: 'Target platform for the design',
  })
  @IsOptional()
  @IsEnum(DesignPlatform)
  platform?: DesignPlatform;

  @ApiPropertyOptional({
    enum: DesignStyle,
    enumName: 'DesignStyle',
    description: 'Visual style preference',
  })
  @IsOptional()
  @IsEnum(DesignStyle)
  style?: DesignStyle;

  @ApiPropertyOptional({
    description: 'Desired number of screens (AI decides if not specified)',
    minimum: 1,
    maximum: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  screenCount?: number;

  @ApiPropertyOptional({
    description: 'Color scheme preference',
    example: 'blue and white',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  colorScheme?: string;
}
