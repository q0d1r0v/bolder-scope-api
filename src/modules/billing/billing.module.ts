import { Module } from '@nestjs/common';
import { BillingController } from '@/modules/billing/controllers/billing.controller';
import { BillingService } from '@/modules/billing/services/billing.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
