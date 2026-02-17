import { Injectable } from '@nestjs/common';
import { CreateCheckoutSessionDto } from '@/modules/billing/dto/create-checkout-session.dto';
import { HandleStripeWebhookDto } from '@/modules/billing/dto/handle-stripe-webhook.dto';

@Injectable()
export class BillingService {
  createCheckoutSession(payload: CreateCheckoutSessionDto) {
    return { message: 'Stripe checkout placeholder', payload };
  }

  handleWebhook(payload: HandleStripeWebhookDto) {
    return { message: 'Stripe webhook placeholder', payload };
  }

  getSubscription(organizationId: string) {
    return { message: 'Subscription lookup placeholder', organizationId };
  }
}
