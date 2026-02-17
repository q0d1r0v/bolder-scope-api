import { Module } from '@nestjs/common';
import { AuthController } from '@/modules/auth/controllers/auth.controller';
import { AuthService } from '@/modules/auth/services/auth.service';
import { EmailIntegrationModule } from '@/modules/integrations/email/email-integration.module';

@Module({
  imports: [EmailIntegrationModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
