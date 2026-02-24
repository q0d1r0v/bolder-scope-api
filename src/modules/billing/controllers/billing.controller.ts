import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
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
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { SkipResponseWrap } from '@/common/decorators/skip-response-wrap.decorator';
import { CreateCheckoutSessionDto } from '@/modules/billing/dto/create-checkout-session.dto';
import { BillingService } from '@/modules/billing/services/billing.service';

@ApiTags('Billing')
@ApiBearerAuth('bearer')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout-session')
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Create a Stripe checkout session for subscription',
  })
  @ApiCreatedResponse({ description: 'Checkout session created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({
    description: 'Insufficient role (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  createCheckoutSession(
    @Body() payload: CreateCheckoutSessionDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.billingService.createCheckoutSession(payload, user);
  }

  @Public()
  @SkipResponseWrap()
  @Post('webhooks/stripe')
  @ApiOperation({
    summary: 'Handle Stripe webhook events (signature verified in service)',
  })
  @ApiOkResponse({ description: 'Webhook processed' })
  @ApiBadRequestResponse({
    description: 'Invalid webhook payload or signature',
  })
  handleStripeWebhook(
    @Req() req: unknown,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = (req as { body: Buffer }).body;
    return this.billingService.handleWebhook(rawBody, signature);
  }

  @Get('subscription/:organizationId')
  @ApiOperation({ summary: 'Get active subscription for an organization' })
  @ApiOkResponse({ description: 'Subscription details' })
  @ApiNotFoundResponse({ description: 'Subscription not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this organization' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getSubscription(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.billingService.getSubscription(organizationId, user);
  }
}
