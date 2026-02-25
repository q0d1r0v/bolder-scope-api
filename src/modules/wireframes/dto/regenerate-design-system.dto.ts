import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RegenerateDesignSystemDto {
  @ApiPropertyOptional({
    description: 'Instruction for design system regeneration',
    example: 'Use blue as primary color and make it dark mode friendly',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instruction?: string;

  @ApiPropertyOptional({
    description: 'Color scheme preference',
    example: 'dark blue and gold',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  colorScheme?: string;
}
