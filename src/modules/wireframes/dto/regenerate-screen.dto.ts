import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RegenerateScreenDto {
  @ApiPropertyOptional({
    description: 'Optional instruction for regeneration',
    example: 'Make it more minimal',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instruction?: string;
}
