import { Module } from '@nestjs/common';
import { AiModule } from '@/modules/ai/ai.module';
import { TechStackController } from '@/modules/tech-stack/controllers/tech-stack.controller';
import { TechStackService } from '@/modules/tech-stack/services/tech-stack.service';

@Module({
  imports: [AiModule],
  controllers: [TechStackController],
  providers: [TechStackService],
  exports: [TechStackService],
})
export class TechStackModule {}
