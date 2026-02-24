import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInviteDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f6...',
    description: 'Invite token received via email',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  token!: string;

  @ApiProperty({
    example: 'Str0ngP@ssword123',
    minLength: 8,
    maxLength: 128,
    description: 'Password for the new account',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({
    example: 'John Doe',
    minLength: 2,
    maxLength: 120,
    description: 'Full name of the user',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;
}
