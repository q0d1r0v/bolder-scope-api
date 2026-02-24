import { Module } from '@nestjs/common';
import { AiModule } from '@/modules/ai/ai.module';
import { WireframesController } from '@/modules/wireframes/controllers/wireframes.controller';
import { WireframesService } from '@/modules/wireframes/services/wireframes.service';

@Module({
  imports: [AiModule],
  controllers: [WireframesController],
  providers: [WireframesService],
  exports: [WireframesService],
})
export class WireframesModule {}
