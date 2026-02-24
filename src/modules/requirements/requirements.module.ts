import { Module } from '@nestjs/common';
import { AiModule } from '@/modules/ai/ai.module';
import { RequirementsController } from '@/modules/requirements/controllers/requirements.controller';
import { RequirementsService } from '@/modules/requirements/services/requirements.service';

@Module({
  imports: [AiModule],
  controllers: [RequirementsController],
  providers: [RequirementsService],
  exports: [RequirementsService],
})
export class RequirementsModule {}
