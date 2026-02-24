import { Module } from '@nestjs/common';
import { EmailIntegrationModule } from '@/modules/integrations/email/email-integration.module';
import { StorageIntegrationModule } from '@/modules/integrations/storage/storage-integration.module';
import { VoiceIntegrationModule } from '@/modules/integrations/voice/voice-integration.module';

@Module({
  imports: [
    EmailIntegrationModule,
    StorageIntegrationModule,
    VoiceIntegrationModule,
  ],
  exports: [
    EmailIntegrationModule,
    StorageIntegrationModule,
    VoiceIntegrationModule,
  ],
})
export class IntegrationsModule {}
