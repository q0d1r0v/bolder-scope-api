import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  BillingInterval,
  InviteStatus,
  InvoiceStatus,
  SubscriptionStatus,
  SystemRole,
} from '@prisma/client';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateCheckoutSessionDto } from '@/modules/billing/dto/create-checkout-session.dto';

/** Stripe v20 moved current_period fields to SubscriptionItem. We use raw shapes for webhook data. */
type WebhookSubscriptionData = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  trial_end: number | null;
  metadata?: Record<string, string>;
  items?: {
    data?: Array<{
      price?: { id?: string; recurring?: { interval?: string } };
      current_period_start?: number;
      current_period_end?: number;
    }>;
  };
};

type WebhookInvoiceData = {
  id: string;
  subscription?: string;
  subscription_details?: { metadata?: Record<string, string> };
  metadata?: Record<string, string>;
  currency?: string;
  amount_due?: number;
  amount_paid?: number;
  period_start?: number;
  period_end?: number;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  payment_intent?: string;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    this.stripe = secretKey ? new Stripe(secretKey) : null;
  }

  async createCheckoutSession(
    payload: CreateCheckoutSessionDto,
    user: CurrentUserShape,
  ) {
    this.ensureConfigured();

    await this.requireOrgMembership(payload.organizationId, user);

    const organization = await this.prisma.organization.findUnique({
      where: { id: payload.organizationId },
      select: {
        id: true,
        name: true,
        billingEmail: true,
        stripeCustomerId: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    let customerId = organization.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripe!.customers.create({
        email: organization.billingEmail ?? user.email,
        name: organization.name,
        metadata: { organizationId: organization.id },
      });

      customerId = customer.id;

      await this.prisma.organization.update({
        where: { id: organization.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await this.stripe!.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: payload.priceId, quantity: 1 }],
      success_url: payload.successUrl,
      cancel_url: payload.cancelUrl,
      metadata: { organizationId: organization.id },
      subscription_data: {
        metadata: { organizationId: organization.id },
      },
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    this.ensureConfigured();

    if (!this.webhookSecret) {
      throw new ServiceUnavailableException(
        'Stripe webhook secret is not configured',
      );
    }

    let event: Stripe.Event;

    try {
      event = this.stripe!.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Stripe webhook signature verification failed: ${message}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Processing Stripe event: ${event.type} (${event.id})`);

    const eventData = event.data.object as unknown as Record<string, unknown>;

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          eventData as unknown as Stripe.Checkout.Session,
        );
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(
          eventData as unknown as WebhookSubscriptionData,
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          eventData as unknown as WebhookSubscriptionData,
        );
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(
          eventData as unknown as WebhookInvoiceData,
        );
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(
          eventData as unknown as WebhookInvoiceData,
        );
        break;

      default:
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return { received: true };
  }

  async getSubscription(organizationId: string, user: CurrentUserShape) {
    await this.requireOrgMembership(organizationId, user);

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        organizationId,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      },
      select: {
        id: true,
        stripeSubscriptionId: true,
        stripePriceId: true,
        status: true,
        interval: true,
        seats: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        trialEndsAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      throw new NotFoundException(
        'No active subscription found for this organization',
      );
    }

    const recentInvoices = await this.prisma.billingInvoice.findMany({
      where: { organizationId },
      select: {
        id: true,
        stripeInvoiceId: true,
        status: true,
        currency: true,
        amountDue: true,
        amountPaid: true,
        paidAt: true,
        hostedInvoiceUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      ...subscription,
      recentInvoices,
    };
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const organizationId = session.metadata?.organizationId;
    if (!organizationId || !session.subscription) {
      return;
    }

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;

    const existing = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      select: { id: true },
    });

    if (existing) {
      return;
    }

    const stripeSubscription = (await this.stripe!.subscriptions.retrieve(
      subscriptionId,
      {
        expand: ['items.data'],
      },
    )) as unknown as WebhookSubscriptionData;

    const firstItem = stripeSubscription.items?.data?.[0];

    await this.prisma.subscription.create({
      data: {
        organizationId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: firstItem?.price?.id ?? '',
        status: this.mapSubscriptionStatus(stripeSubscription.status),
        interval:
          firstItem?.price?.recurring?.interval === 'year'
            ? BillingInterval.YEARLY
            : BillingInterval.MONTHLY,
        seats: 1,
        currentPeriodStart: new Date(
          (firstItem?.current_period_start ?? Math.floor(Date.now() / 1000)) *
            1000,
        ),
        currentPeriodEnd: new Date(
          (firstItem?.current_period_end ??
            Math.floor(Date.now() / 1000) + 2592000) * 1000,
        ),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        trialEndsAt: stripeSubscription.trial_end
          ? new Date(stripeSubscription.trial_end * 1000)
          : null,
      },
    });

    this.logger.log(`Subscription created for organization ${organizationId}`);
  }

  private async handleSubscriptionUpdated(
    subscription: WebhookSubscriptionData,
  ) {
    const existing = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
      select: { id: true },
    });

    if (!existing) {
      return;
    }

    const firstItem = subscription.items?.data?.[0];

    await this.prisma.subscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: this.mapSubscriptionStatus(subscription.status),
        currentPeriodStart: firstItem?.current_period_start
          ? new Date(firstItem.current_period_start * 1000)
          : undefined,
        currentPeriodEnd: firstItem?.current_period_end
          ? new Date(firstItem.current_period_end * 1000)
          : undefined,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : null,
      },
    });
  }

  private async handleSubscriptionDeleted(
    subscription: WebhookSubscriptionData,
  ) {
    const existing = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
      select: { id: true },
    });

    if (!existing) {
      return;
    }

    await this.prisma.subscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
      },
    });
  }

  private async handleInvoicePaid(invoice: WebhookInvoiceData) {
    if (!invoice.subscription) return;

    const organizationId =
      invoice.subscription_details?.metadata?.organizationId ??
      invoice.metadata?.organizationId;

    if (!organizationId) {
      const sub = await this.prisma.subscription.findUnique({
        where: { stripeSubscriptionId: invoice.subscription },
        select: { organizationId: true },
      });

      if (!sub) return;

      await this.upsertInvoice(
        invoice,
        sub.organizationId,
        invoice.subscription,
      );
      return;
    }

    await this.upsertInvoice(invoice, organizationId, invoice.subscription);
  }

  private async handleInvoicePaymentFailed(invoice: WebhookInvoiceData) {
    if (!invoice.id) return;

    const existing = await this.prisma.billingInvoice.findUnique({
      where: { stripeInvoiceId: invoice.id },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.billingInvoice.update({
        where: { stripeInvoiceId: invoice.id },
        data: { status: InvoiceStatus.OPEN },
      });
    }
  }

  private async upsertInvoice(
    invoice: WebhookInvoiceData,
    organizationId: string,
    stripeSubscriptionId: string,
  ) {
    if (!invoice.id) return;

    const subscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      select: { id: true },
    });

    const data = {
      organizationId,
      subscriptionId: subscription?.id ?? null,
      status: InvoiceStatus.PAID,
      currency: (invoice.currency ?? 'usd').toUpperCase(),
      amountDue: (invoice.amount_due ?? 0) / 100,
      amountPaid: (invoice.amount_paid ?? 0) / 100,
      periodStart: invoice.period_start
        ? new Date(invoice.period_start * 1000)
        : null,
      periodEnd: invoice.period_end
        ? new Date(invoice.period_end * 1000)
        : null,
      paidAt: new Date(),
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      pdfUrl: invoice.invoice_pdf ?? null,
      stripePaymentIntentId: invoice.payment_intent ?? null,
    };

    await this.prisma.billingInvoice.upsert({
      where: { stripeInvoiceId: invoice.id },
      create: {
        ...data,
        stripeInvoiceId: invoice.id,
      },
      update: data,
    });
  }

  private mapSubscriptionStatus(status: string): SubscriptionStatus {
    const map: Record<string, SubscriptionStatus> = {
      trialing: SubscriptionStatus.TRIALING,
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      unpaid: SubscriptionStatus.UNPAID,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
      paused: SubscriptionStatus.PAUSED,
    };

    return map[status] ?? SubscriptionStatus.ACTIVE;
  }

  private async requireOrgMembership(
    organizationId: string,
    user: CurrentUserShape,
  ) {
    if (user.systemRole === SystemRole.SUPER_ADMIN) {
      return;
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.userId } },
      select: { id: true, inviteStatus: true },
    });

    if (!membership || membership.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You are not a member of this organization');
    }
  }

  private ensureConfigured(): void {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }
  }
}
