import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApplyStyleDto {
  @ApiProperty({
    description: 'Style instruction to apply across all screens',
    example: 'Make everything more minimal with more whitespace',
    minLength: 3,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  instruction!: string;
}
