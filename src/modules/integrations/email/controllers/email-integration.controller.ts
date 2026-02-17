import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { SendTransactionalEmailDto } from '@/modules/integrations/email/dto/send-transactional-email.dto';
import { EmailIntegrationService } from '@/modules/integrations/email/services/email-integration.service';

@ApiTags('Integrations: Email')
@ApiBearerAuth('bearer')
@Controller('integrations/email')
export class EmailIntegrationController {
  constructor(private readonly emailIntegrationService: EmailIntegrationService) {}

  @Post('send')
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Send a transactional email via SendGrid' })
  @ApiCreatedResponse({ description: 'Email sent successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Insufficient role (requires OWNER or ADMIN)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  send(@Body() payload: SendTransactionalEmailDto) {
    return this.emailIntegrationService.send(payload);
  }
}
