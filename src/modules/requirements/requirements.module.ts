import { Module } from '@nestjs/common';
import { RequirementsController } from '@/modules/requirements/controllers/requirements.controller';
import { RequirementsService } from '@/modules/requirements/services/requirements.service';

@Module({
  controllers: [RequirementsController],
  providers: [RequirementsService],
  exports: [RequirementsService],
})
export class RequirementsModule {}
