import { IsObject, IsString, MaxLength } from 'class-validator';

export class HandleStripeWebhookDto {
  @IsString()
  @MaxLength(255)
  eventId!: string;

  @IsString()
  @MaxLength(255)
  eventType!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
