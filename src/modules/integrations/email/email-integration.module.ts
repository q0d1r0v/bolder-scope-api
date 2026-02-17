import { Module } from '@nestjs/common';
import { EmailIntegrationController } from '@/modules/integrations/email/controllers/email-integration.controller';
import { EmailIntegrationService } from '@/modules/integrations/email/services/email-integration.service';

@Module({
  controllers: [EmailIntegrationController],
  providers: [EmailIntegrationService],
  exports: [EmailIntegrationService],
})
export class EmailIntegrationModule {}
