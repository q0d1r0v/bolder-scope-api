import { Injectable } from '@nestjs/common';
import { CreateUploadUrlDto } from '@/modules/integrations/storage/dto/create-upload-url.dto';

@Injectable()
export class StorageIntegrationService {
  createUploadUrl(payload: CreateUploadUrlDto) {
    return { message: 'Cloudflare R2 upload URL placeholder', payload };
  }
}
