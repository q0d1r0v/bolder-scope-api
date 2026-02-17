import { IsString, IsUrl, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  priceId!: string;

  @IsUrl({ require_tld: false })
  successUrl!: string;

  @IsUrl({ require_tld: false })
  cancelUrl!: string;
}
