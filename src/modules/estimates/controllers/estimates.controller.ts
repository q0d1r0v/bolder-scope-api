import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { GenerateEstimateDto } from '@/modules/estimates/dto/generate-estimate.dto';
import { EstimatesService } from '@/modules/estimates/services/estimates.service';

@ApiTags('Estimates')
@ApiBearerAuth('bearer')
@Controller('estimates')
export class EstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a cost and timeline estimate for a project' })
  @ApiCreatedResponse({ description: 'Estimate snapshot generated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  generate(@Body() payload: GenerateEstimateDto) {
    return this.estimatesService.generate(payload);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'List estimate snapshots for a project' })
  @ApiOkResponse({ description: 'Paginated list of estimate snapshots' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  listByProject(@Param('projectId') projectId: string, @Query() query: PaginationQueryDto) {
    return this.estimatesService.listByProject(projectId, query);
  }

  @Get('project/:projectId/latest')
  @ApiOperation({ summary: 'Get the latest estimate snapshot for a project' })
  @ApiOkResponse({ description: 'Latest estimate snapshot' })
  @ApiNotFoundResponse({ description: 'Project or estimate not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getLatest(@Param('projectId') projectId: string) {
    return this.estimatesService.getLatest(projectId);
  }
}
