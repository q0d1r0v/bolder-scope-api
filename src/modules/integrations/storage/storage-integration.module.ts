import { Module } from '@nestjs/common';
import { StorageIntegrationController } from '@/modules/integrations/storage/controllers/storage-integration.controller';
import { StorageIntegrationService } from '@/modules/integrations/storage/services/storage-integration.service';

@Module({
  controllers: [StorageIntegrationController],
  providers: [StorageIntegrationService],
  exports: [StorageIntegrationService],
})
export class StorageIntegrationModule {}
