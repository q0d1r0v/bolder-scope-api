import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ description: 'Response payload' })
  data!: unknown;

  @ApiProperty({ format: 'date-time', example: '2026-02-18T12:00:00.000Z' })
  timestamp!: string;
}

export class ApiMessageResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 'Operation completed successfully' })
  message!: string;

  @ApiProperty({ format: 'date-time', example: '2026-02-18T12:00:00.000Z' })
  timestamp!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ example: 400, description: 'HTTP status code' })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request', description: 'Error type' })
  error!: string;

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Validation failed',
    description: 'Error message or array of validation messages',
  })
  message!: string | string[];

  @ApiProperty({ example: '/api/v1/resource', description: 'Request path' })
  path!: string;

  @ApiProperty({ format: 'date-time', example: '2026-02-18T12:00:00.000Z' })
  timestamp!: string;
}
