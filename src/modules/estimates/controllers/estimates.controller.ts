import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { GenerateEstimateDto } from '@/modules/estimates/dto/generate-estimate.dto';
import { EstimatesService } from '@/modules/estimates/services/estimates.service';

@ApiTags('Estimates')
@ApiBearerAuth('bearer')
@Controller('estimates')
export class EstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate a cost and timeline estimate for a project',
  })
  @ApiCreatedResponse({ description: 'Estimate snapshot generated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  generate(
    @Body() payload: GenerateEstimateDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.estimatesService.generate(payload, user);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'List estimate snapshots for a project' })
  @ApiOkResponse({ description: 'Paginated list of estimate snapshots' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  listByProject(
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.estimatesService.listByProject(projectId, query, user);
  }

  @Get('project/:projectId/latest')
  @ApiOperation({ summary: 'Get the latest estimate snapshot for a project' })
  @ApiOkResponse({ description: 'Latest estimate snapshot' })
  @ApiNotFoundResponse({ description: 'Project or estimate not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getLatest(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.estimatesService.getLatest(projectId, user);
  }
}
