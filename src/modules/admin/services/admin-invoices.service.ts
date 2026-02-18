import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { buildPrismaPagination, paginate } from '@/common/helpers/pagination.helper';
import { AdminInvoicesQueryDto } from '@/modules/admin/dto/admin-invoices.dto';

@Injectable()
export class AdminInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AdminInvoicesQueryDto) {
    const where: Prisma.BillingInvoiceWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    const { skip, take } = buildPrismaPagination(query);

    const [invoices, total] = await Promise.all([
      this.prisma.billingInvoice.findMany({
        where,
        select: {
          id: true,
          stripeInvoiceId: true,
          status: true,
          currency: true,
          amountDue: true,
          amountPaid: true,
          periodStart: true,
          periodEnd: true,
          dueAt: true,
          paidAt: true,
          createdAt: true,
          organization: {
            select: { id: true, name: true, slug: true, type: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.billingInvoice.count({ where }),
    ]);

    return paginate(invoices, total, query);
  }

  async findOne(invoiceId: string) {
    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        stripeInvoiceId: true,
        stripePaymentIntentId: true,
        status: true,
        currency: true,
        amountDue: true,
        amountPaid: true,
        periodStart: true,
        periodEnd: true,
        dueAt: true,
        paidAt: true,
        hostedInvoiceUrl: true,
        pdfUrl: true,
        createdAt: true,
        updatedAt: true,
        organization: {
          select: { id: true, name: true, slug: true, type: true, status: true },
        },
        subscription: {
          select: {
            id: true,
            stripeSubscriptionId: true,
            status: true,
            interval: true,
            seats: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }
}
