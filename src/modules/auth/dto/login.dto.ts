import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
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
}
