import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { buildPrismaPagination, paginate } from '@/common/helpers/pagination.helper';
import { AdminSubscriptionsQueryDto } from '@/modules/admin/dto/admin-subscriptions.dto';

@Injectable()
export class AdminSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AdminSubscriptionsQueryDto) {
    const where: Prisma.SubscriptionWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.interval) {
      where.interval = query.interval;
    }

    const { skip, take } = buildPrismaPagination(query);

    const [subscriptions, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
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
          canceledAt: true,
          trialEndsAt: true,
          createdAt: true,
          organization: {
            select: { id: true, name: true, slug: true, type: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return paginate(subscriptions, total, query);
  }

  async findOne(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
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
        canceledAt: true,
        trialEndsAt: true,
        createdAt: true,
        updatedAt: true,
        organization: {
          select: { id: true, name: true, slug: true, type: true, status: true },
        },
        invoices: {
          select: {
            id: true,
            stripeInvoiceId: true,
            status: true,
            amountDue: true,
            amountPaid: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return subscription;
  }
}
