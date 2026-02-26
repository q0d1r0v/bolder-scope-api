import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import { SkipResponseWrap } from '@/common/decorators/skip-response-wrap.decorator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { GenerateEstimateDto } from '@/modules/estimates/dto/generate-estimate.dto';
import { GenerateProfessionalEstimateDto } from '@/modules/estimates/dto/generate-professional-estimate.dto';
import { RegenerateEstimateSectionDto } from '@/modules/estimates/dto/regenerate-estimate-section.dto';
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

  @Post('generate-professional')
  @ApiOperation({
    summary: 'Generate a professional 10-section project estimate',
  })
  @ApiCreatedResponse({
    description: 'Professional estimate with all 10 sections generated',
  })
  @ApiBadRequestResponse({ description: 'Validation failed or missing requirements' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  generateProfessional(
    @Body() payload: GenerateProfessionalEstimateDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.estimatesService.generateProfessional(payload, user);
  }

  @Post('regenerate-section')
  @ApiOperation({
    summary: 'Regenerate a specific section of an existing professional estimate',
  })
  @ApiOkResponse({ description: 'Section regenerated successfully' })
  @ApiBadRequestResponse({ description: 'Estimate has no professional breakdown' })
  @ApiNotFoundResponse({ description: 'Estimate not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  regenerateSection(
    @Body() payload: RegenerateEstimateSectionDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.estimatesService.regenerateSection(payload, user);
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

  @Get('project/:projectId/full')
  @ApiOperation({
    summary: 'Get the full professional estimate with all 10 sections',
  })
  @ApiOkResponse({ description: 'Full professional estimate with breakdownJson' })
  @ApiNotFoundResponse({ description: 'Project or estimate not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getFullEstimate(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.estimatesService.getFullEstimate(projectId, user);
  }

  @Get(':estimateId/export/pdf')
  @SkipResponseWrap()
  @ApiOperation({ summary: 'Export estimate as a professional PDF document' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'PDF file' })
  @ApiBadRequestResponse({ description: 'Estimate has no professional breakdown' })
  @ApiNotFoundResponse({ description: 'Estimate not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async exportPdf(
    @Param('estimateId') estimateId: string,
    @CurrentUser() user: CurrentUserShape,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.estimatesService.exportPdf(estimateId, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="estimate-${estimateId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}
