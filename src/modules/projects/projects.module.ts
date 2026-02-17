import { Module } from '@nestjs/common';
import { ProjectsController } from '@/modules/projects/controllers/projects.controller';
import { ProjectsService } from '@/modules/projects/services/projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
