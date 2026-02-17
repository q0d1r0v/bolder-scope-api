import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZjJmNGNlYi01NmNjLTRmMmItYTBiMS1lN2ZhMTM4ZjdkNTIiLCJlbWFpbCI6ImZvdW5kZXJAYm9sZGVyLXNjb3BlLmNvbSIsInR5cGUiOiJlbWFpbF92ZXJpZmljYXRpb24iLCJpYXQiOjE3MDgwODAwMDAsImV4cCI6MTcwODE2NjQwMH0.mFq5GN0vXxv8BLmWQ7fN0d7H26Qt19VtaY9ksQjWvQI',
    minLength: 20,
    maxLength: 4096,
    description: 'Email verification token received via email',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;
}
