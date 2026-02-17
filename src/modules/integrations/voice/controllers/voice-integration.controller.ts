import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TranscribeVoiceDto } from '@/modules/integrations/voice/dto/transcribe-voice.dto';
import { VoiceIntegrationService } from '@/modules/integrations/voice/services/voice-integration.service';

@ApiTags('Integrations: Voice')
@ApiBearerAuth('bearer')
@Controller('integrations/voice')
export class VoiceIntegrationController {
  constructor(private readonly voiceIntegrationService: VoiceIntegrationService) {}

  @Post('transcribe')
  @ApiOperation({ summary: 'Transcribe a voice file using AI' })
  @ApiCreatedResponse({ description: 'Transcription completed' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  transcribe(@Body() payload: TranscribeVoiceDto) {
    return this.voiceIntegrationService.transcribe(payload);
  }
}
