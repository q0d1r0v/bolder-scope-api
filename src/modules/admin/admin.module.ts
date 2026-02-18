import { Module } from '@nestjs/common';
import { AdminUsersController } from '@/modules/admin/controllers/admin-users.controller';
import { AdminOrganizationsController } from '@/modules/admin/controllers/admin-organizations.controller';
import { AdminSubscriptionsController } from '@/modules/admin/controllers/admin-subscriptions.controller';
import { AdminInvoicesController } from '@/modules/admin/controllers/admin-invoices.controller';
import { AdminAnalyticsController } from '@/modules/admin/controllers/admin-analytics.controller';
import { AdminAiRunsController } from '@/modules/admin/controllers/admin-ai-runs.controller';
import { AdminUsersService } from '@/modules/admin/services/admin-users.service';
import { AdminOrganizationsService } from '@/modules/admin/services/admin-organizations.service';
import { AdminSubscriptionsService } from '@/modules/admin/services/admin-subscriptions.service';
import { AdminInvoicesService } from '@/modules/admin/services/admin-invoices.service';
import { AdminAnalyticsService } from '@/modules/admin/services/admin-analytics.service';
import { AdminAiRunsService } from '@/modules/admin/services/admin-ai-runs.service';

@Module({
  controllers: [
    AdminUsersController,
    AdminOrganizationsController,
    AdminSubscriptionsController,
    AdminInvoicesController,
    AdminAnalyticsController,
    AdminAiRunsController,
  ],
  providers: [
    AdminUsersService,
    AdminOrganizationsService,
    AdminSubscriptionsService,
    AdminInvoicesService,
    AdminAnalyticsService,
    AdminAiRunsService,
  ],
})
export class AdminModule {}
