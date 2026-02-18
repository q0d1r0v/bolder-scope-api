import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { SystemRoles } from '@/common/decorators/system-roles.decorator';
import { AdminSubscriptionsQueryDto } from '@/modules/admin/dto/admin-subscriptions.dto';
import { AdminSubscriptionsService } from '@/modules/admin/services/admin-subscriptions.service';

@ApiTags('Admin - Subscriptions')
@ApiBearerAuth('bearer')
@SystemRoles(SystemRole.SUPER_ADMIN)
@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
  constructor(private readonly adminSubscriptionsService: AdminSubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all subscriptions (admin)' })
  @ApiOkResponse({ description: 'Paginated list of all subscriptions' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  findAll(@Query() query: AdminSubscriptionsQueryDto) {
    return this.adminSubscriptionsService.findAll(query);
  }

  @Get(':subscriptionId')
  @ApiOperation({ summary: 'Get subscription details (admin)' })
  @ApiOkResponse({ description: 'Subscription details with invoices' })
  @ApiNotFoundResponse({ description: 'Subscription not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  findOne(@Param('subscriptionId') subscriptionId: string) {
    return this.adminSubscriptionsService.findOne(subscriptionId);
  }
}
