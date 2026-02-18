import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BillingInterval, SubscriptionStatus } from '@prisma/client';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

export class AdminSubscriptionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus', description: 'Filter by subscription status' })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ enum: BillingInterval, enumName: 'BillingInterval', description: 'Filter by billing interval' })
  @IsOptional()
  @IsEnum(BillingInterval)
  interval?: BillingInterval;
}
