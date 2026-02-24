import { Module } from '@nestjs/common';
import { AiModule } from '@/modules/ai/ai.module';
import { CodeGenerationController } from '@/modules/code-generation/controllers/code-generation.controller';
import { CodeGenerationService } from '@/modules/code-generation/services/code-generation.service';

@Module({
  imports: [AiModule],
  controllers: [CodeGenerationController],
  providers: [CodeGenerationService],
  exports: [CodeGenerationService],
})
export class CodeGenerationModule {}
