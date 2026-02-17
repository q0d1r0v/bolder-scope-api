import { Module } from '@nestjs/common';
import { TechStackController } from '@/modules/tech-stack/controllers/tech-stack.controller';
import { TechStackService } from '@/modules/tech-stack/services/tech-stack.service';

@Module({
  controllers: [TechStackController],
  providers: [TechStackService],
  exports: [TechStackService],
})
export class TechStackModule {}
