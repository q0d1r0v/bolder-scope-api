import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SendTransactionalEmailDto } from '@/modules/integrations/email/dto/send-transactional-email.dto';

@Injectable()
export class EmailIntegrationService {
  private readonly logger = new Logger(EmailIntegrationService.name);
  private readonly sendgridApiKey: string | null;
  private readonly sendgridFromEmail: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.sendgridApiKey = this.configService.get<string>('SENDGRID_API_KEY')?.trim() || null;
    this.sendgridFromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL')?.trim() || null;
  }

  async send(payload: SendTransactionalEmailDto) {
    const resolvedEmail = this.normalizeEmail(payload.toEmail);
    const templateKey = payload.templateKey.trim();
    const delivery = await this.prisma.emailDelivery.create({
      data: {
        organizationId: payload.organizationId,
        userId: payload.userId,
        templateKey,
        toEmail: resolvedEmail,
        subject: payload.subject ?? null,
        payload: this.toInputJsonValue(payload.payload),
        status: EmailStatus.QUEUED,
      },
      select: {
        id: true,
      },
    });

    if (!this.sendgridApiKey || !this.sendgridFromEmail) {
      await this.failDelivery(
        delivery.id,
        'SendGrid is not configured (SENDGRID_API_KEY and SENDGRID_FROM_EMAIL are required)',
      );
      throw new ServiceUnavailableException(
        'Email service is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.',
      );
    }

    try {
      const compiledContent = this.resolveEmailContent(payload);
      const sendgridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.sendgridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: resolvedEmail }],
              dynamic_template_data: payload.payload ?? {},
            },
          ],
          from: {
            email: this.sendgridFromEmail,
          },
          subject: compiledContent.subject,
          content: [
            { type: 'text/plain', value: compiledContent.text },
            { type: 'text/html', value: compiledContent.html },
          ],
        }),
      });

      if (!sendgridResponse.ok) {
        const errorMessage = await this.extractSendgridError(sendgridResponse);
        await this.failDelivery(delivery.id, errorMessage);
        throw new BadGatewayException(`SendGrid rejected email: ${errorMessage}`);
      }

      const providerMessageId = sendgridResponse.headers.get('x-message-id');
      await this.prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: EmailStatus.SENT,
          providerMessageId: providerMessageId ?? null,
          subject: compiledContent.subject,
          sentAt: new Date(),
          errorMessage: null,
        },
      });

      return {
        message: 'Email sent successfully',
        deliveryId: delivery.id,
        status: EmailStatus.SENT,
        providerMessageId,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      const errorMessage = this.extractErrorMessage(error);
      await this.failDelivery(delivery.id, errorMessage);
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException(`Failed to send email: ${errorMessage}`);
    }
  }

  async sendBestEffort(payload: SendTransactionalEmailDto): Promise<boolean> {
    try {
      await this.send(payload);
      return true;
    } catch (error) {
      this.logger.warn(
        `Email send failed for template=${payload.templateKey} to=${payload.toEmail}: ${this.extractErrorMessage(error)}`,
      );
      return false;
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private resolveEmailContent(payload: SendTransactionalEmailDto): {
    subject: string;
    html: string;
    text: string;
  } {
    if (payload.subject && payload.html && payload.text) {
      return {
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      };
    }

    if (payload.templateKey.trim().toUpperCase() === 'AUTH_EMAIL_VERIFICATION') {
      const fullName = this.extractString(payload.payload, 'fullName') ?? 'there';
      const verificationUrl = this.extractString(payload.payload, 'verificationUrl');
      const expiresAt = this.extractString(payload.payload, 'expiresAt');

      if (!verificationUrl || !expiresAt) {
        throw new BadGatewayException(
          'AUTH_EMAIL_VERIFICATION template requires verificationUrl and expiresAt payload keys',
        );
      }

      return {
        subject: payload.subject ?? 'Verify your email to activate Bolder Scope',
        text:
          payload.text ??
          [
            `Hi ${fullName},`,
            '',
            'Thanks for registering on Bolder Scope.',
            `Verify your email here: ${verificationUrl}`,
            `This link expires at ${expiresAt}.`,
          ].join('\n'),
        html:
          payload.html ??
          [
            `<p>Hi ${this.escapeHtml(fullName)},</p>`,
            '<p>Thanks for registering on Bolder Scope.</p>',
            `<p>Verify your email by clicking <a href="${verificationUrl}">this verification link</a>.</p>`,
            `<p>This link expires at <strong>${this.escapeHtml(expiresAt)}</strong>.</p>`,
          ].join(''),
      };
    }

    const fallbackPayload = JSON.stringify(payload.payload ?? {}, null, 2);
    return {
      subject: payload.subject ?? `Bolder Scope notification (${payload.templateKey})`,
      text: payload.text ?? fallbackPayload,
      html: payload.html ?? `<pre>${this.escapeHtml(fallbackPayload)}</pre>`,
    };
  }

  private extractString(
    payload: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const value = payload?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }

  private async extractSendgridError(response: Response): Promise<string> {
    try {
      const parsed = (await response.json()) as { errors?: Array<{ message?: string }> };
      const message = parsed.errors?.[0]?.message;
      if (message) {
        return message;
      }
    } catch {
      // Ignore JSON parse failures and fall back to status text.
    }

    return `HTTP ${response.status} ${response.statusText}`;
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown email send error';
  }

  private toInputJsonValue(
    value: Record<string, unknown> | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (!value) {
      return undefined;
    }

    return value as unknown as Prisma.InputJsonValue;
  }

  private async failDelivery(deliveryId: string, errorMessage: string): Promise<void> {
    await this.prisma.emailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: EmailStatus.FAILED,
        errorMessage: errorMessage.slice(0, 1000),
      },
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
