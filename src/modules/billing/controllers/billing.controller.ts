import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { SkipResponseWrap } from '@/common/decorators/skip-response-wrap.decorator';
import { CreateCheckoutSessionDto } from '@/modules/billing/dto/create-checkout-session.dto';
import { HandleStripeWebhookDto } from '@/modules/billing/dto/handle-stripe-webhook.dto';
import { BillingService } from '@/modules/billing/services/billing.service';

@ApiTags('Billing')
@ApiBearerAuth('bearer')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout-session')
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Create a Stripe checkout session for subscription' })
  @ApiCreatedResponse({ description: 'Checkout session created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Insufficient role (requires OWNER or ADMIN)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  createCheckoutSession(@Body() payload: CreateCheckoutSessionDto) {
    return this.billingService.createCheckoutSession(payload);
  }

  @Public()
  @SkipResponseWrap()
  @Post('webhooks/stripe')
  @ApiOperation({ summary: 'Handle Stripe webhook events (signature verified in service)' })
  @ApiOkResponse({ description: 'Webhook processed' })
  @ApiBadRequestResponse({ description: 'Invalid webhook payload or signature' })
  handleStripeWebhook(@Body() payload: HandleStripeWebhookDto) {
    return this.billingService.handleWebhook(payload);
  }

  @Get('subscription/:organizationId')
  @ApiOperation({ summary: 'Get active subscription for an organization' })
  @ApiOkResponse({ description: 'Subscription details' })
  @ApiNotFoundResponse({ description: 'Subscription not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this organization' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getSubscription(@Param('organizationId') organizationId: string) {
    return this.billingService.getSubscription(organizationId);
  }
}
