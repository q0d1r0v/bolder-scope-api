import { Module } from '@nestjs/common';
import { HealthController } from '@/modules/health/health.controller';
import { HealthService } from '@/modules/health/health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
