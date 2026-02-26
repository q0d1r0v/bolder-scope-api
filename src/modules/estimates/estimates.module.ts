import { Module } from '@nestjs/common';
import { AiModule } from '@/modules/ai/ai.module';
import { EstimatesController } from '@/modules/estimates/controllers/estimates.controller';
import { EstimatesService } from '@/modules/estimates/services/estimates.service';
import { EstimatePdfService } from '@/modules/estimates/services/estimate-pdf.service';

@Module({
  imports: [AiModule],
  controllers: [EstimatesController],
  providers: [EstimatesService, EstimatePdfService],
  exports: [EstimatesService],
})
export class EstimatesModule {}
