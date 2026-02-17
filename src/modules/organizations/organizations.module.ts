import { Module } from '@nestjs/common';
import { EmailIntegrationModule } from '@/modules/integrations/email/email-integration.module';
import { OrganizationsController } from '@/modules/organizations/controllers/organizations.controller';
import { OrganizationsService } from '@/modules/organizations/services/organizations.service';

@Module({
  imports: [EmailIntegrationModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
