import { Module } from '@nestjs/common';
import { VoiceIntegrationController } from '@/modules/integrations/voice/controllers/voice-integration.controller';
import { VoiceIntegrationService } from '@/modules/integrations/voice/services/voice-integration.service';

@Module({
  controllers: [VoiceIntegrationController],
  providers: [VoiceIntegrationService],
  exports: [VoiceIntegrationService],
})
export class VoiceIntegrationModule {}
