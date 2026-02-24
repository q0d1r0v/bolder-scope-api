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
import { AdminAiRunsQueryDto } from '@/modules/admin/dto/admin-ai-runs.dto';
import { AdminAiRunsService } from '@/modules/admin/services/admin-ai-runs.service';

@ApiTags('Admin - AI Runs')
@ApiBearerAuth('bearer')
@SystemRoles(SystemRole.SUPER_ADMIN)
@Controller('admin/ai-runs')
export class AdminAiRunsController {
  constructor(private readonly adminAiRunsService: AdminAiRunsService) {}

  @Get()
  @ApiOperation({ summary: 'List all AI runs (admin)' })
  @ApiOkResponse({ description: 'Paginated list of all AI runs' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  findAll(@Query() query: AdminAiRunsQueryDto) {
    return this.adminAiRunsService.findAll(query);
  }

  @Get(':aiRunId')
  @ApiOperation({ summary: 'Get AI run details (admin)' })
  @ApiOkResponse({
    description: 'AI run details with organization, project, and initiator',
  })
  @ApiNotFoundResponse({ description: 'AI run not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  findOne(@Param('aiRunId') aiRunId: string) {
    return this.adminAiRunsService.findOne(aiRunId);
  }
}
