import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    example:
      'f47ac10b-58cc-4372-a567-0e02b2c3d479.uXo3QxUkPKW4fFJHk1fQb7j9P5r1w2Qxw5nMg7xQhR2',
    minLength: 20,
    maxLength: 2048,
    description: 'Refresh token returned by login/register/refresh endpoints',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  refreshToken!: string;
}
