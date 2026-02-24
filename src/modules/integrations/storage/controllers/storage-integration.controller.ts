import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CreateUploadUrlDto } from '@/modules/integrations/storage/dto/create-upload-url.dto';
import { StorageIntegrationService } from '@/modules/integrations/storage/services/storage-integration.service';

@ApiTags('Integrations: Storage')
@ApiBearerAuth('bearer')
@Controller('integrations/storage')
export class StorageIntegrationController {
  constructor(
    private readonly storageIntegrationService: StorageIntegrationService,
  ) {}

  @Post('upload-url')
  @ApiOperation({
    summary: 'Generate a pre-signed upload URL for file storage',
  })
  @ApiCreatedResponse({ description: 'Pre-signed upload URL generated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  createUploadUrl(@Body() payload: CreateUploadUrlDto) {
    return this.storageIntegrationService.createUploadUrl(payload);
  }
}
