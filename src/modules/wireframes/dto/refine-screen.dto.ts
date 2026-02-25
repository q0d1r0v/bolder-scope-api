import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefineScreenDto {
  @ApiProperty({
    description: 'Instruction for refining the screen',
    example: 'Make the header bigger and add a search bar',
    minLength: 3,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  instruction!: string;
}
