import { Module } from '@nestjs/common';
import { EstimatesController } from '@/modules/estimates/controllers/estimates.controller';
import { EstimatesService } from '@/modules/estimates/services/estimates.service';

@Module({
  controllers: [EstimatesController],
  providers: [EstimatesService],
  exports: [EstimatesService],
})
export class EstimatesModule {}
