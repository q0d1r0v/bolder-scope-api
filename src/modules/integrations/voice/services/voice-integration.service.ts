import { Injectable } from '@nestjs/common';
import { TranscribeVoiceDto } from '@/modules/integrations/voice/dto/transcribe-voice.dto';

@Injectable()
export class VoiceIntegrationService {
  transcribe(payload: TranscribeVoiceDto) {
    return { message: 'ElevenLabs transcription placeholder', payload };
  }
}
