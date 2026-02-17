import { Module } from '@nestjs/common';
import { AiController } from '@/modules/ai/controllers/ai.controller';
import { AiService } from '@/modules/ai/services/ai.service';

@Module({
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
