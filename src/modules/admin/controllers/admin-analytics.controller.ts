import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { SystemRoles } from '@/common/decorators/system-roles.decorator';
import { AdminAnalyticsService } from '@/modules/admin/services/admin-analytics.service';

@ApiTags('Admin - Analytics')
@ApiBearerAuth('bearer')
@SystemRoles(SystemRole.SUPER_ADMIN)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get platform overview statistics (admin)' })
  @ApiOkResponse({ description: 'Platform overview with user, org, project, subscription, and revenue stats' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  getOverview() {
    return this.adminAnalyticsService.getOverview();
  }

  @Get('ai-usage')
  @ApiOperation({ summary: 'Get AI usage statistics (admin)' })
  @ApiOkResponse({ description: 'AI usage stats by provider and task type' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  getAiUsage() {
    return this.adminAnalyticsService.getAiUsage();
  }

  @Get('recent-activity')
  @ApiOperation({ summary: 'Get recent platform activity (admin)' })
  @ApiOkResponse({ description: 'Recent users, organizations, and projects' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  getRecentActivity() {
    return this.adminAnalyticsService.getRecentActivity();
  }
}
