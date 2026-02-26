import { Module } from '@nestjs/common';
import { AiModule } from '@/modules/ai/ai.module';
import { WireframesController } from '@/modules/wireframes/controllers/wireframes.controller';
import { WireframesService } from '@/modules/wireframes/services/wireframes.service';
import { WireframeValidatorService } from '@/modules/wireframes/services/wireframe-validator.service';
import { WireframeBeautifierService } from '@/modules/wireframes/services/wireframe-beautifier.service';
import { WireframeRendererService } from '@/modules/wireframes/services/wireframe-renderer.service';

@Module({
  imports: [AiModule],
  controllers: [WireframesController],
  providers: [
    WireframesService,
    WireframeValidatorService,
    WireframeBeautifierService,
    WireframeRendererService,
  ],
  exports: [WireframesService],
})
export class WireframesModule {}
