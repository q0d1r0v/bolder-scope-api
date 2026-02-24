import { Module } from '@nestjs/common';
import { AiModule } from '@/modules/ai/ai.module';
import { UserFlowsController } from '@/modules/user-flows/controllers/user-flows.controller';
import { UserFlowsService } from '@/modules/user-flows/services/user-flows.service';

@Module({
  imports: [AiModule],
  controllers: [UserFlowsController],
  providers: [UserFlowsService],
  exports: [UserFlowsService],
})
export class UserFlowsModule {}
