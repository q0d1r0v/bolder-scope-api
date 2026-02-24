import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
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
import type { Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import { SkipResponseWrap } from '@/common/decorators/skip-response-wrap.decorator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { GenerateWireframeDto } from '@/modules/wireframes/dto/generate-wireframe.dto';
import {
  ExportFormat,
  ExportWireframeDto,
} from '@/modules/wireframes/dto/export-wireframe.dto';
import { WireframesService } from '@/modules/wireframes/services/wireframes.service';

@ApiTags('Wireframes')
@ApiBearerAuth('bearer')
@Controller('wireframes')
export class WireframesController {
  constructor(private readonly wireframesService: WireframesService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate wireframes from project requirements and user flows',
  })
  @ApiCreatedResponse({ description: 'Wireframe snapshot generated' })
  @ApiBadRequestResponse({ description: 'Validation failed or missing dependencies' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  generate(
    @Body() payload: GenerateWireframeDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.generate(payload, user);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'List wireframe snapshots for a project' })
  @ApiOkResponse({ description: 'Paginated list of wireframe snapshots' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  listByProject(
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.listByProject(projectId, query, user);
  }

  @Get('project/:projectId/latest')
  @ApiOperation({ summary: 'Get the latest wireframe snapshot for a project' })
  @ApiOkResponse({ description: 'Latest wireframe snapshot with screens' })
  @ApiNotFoundResponse({ description: 'Project or wireframe not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getLatest(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.getLatest(projectId, user);
  }

  @Get(':wireframeId')
  @ApiOperation({ summary: 'Get a specific wireframe snapshot by ID' })
  @ApiOkResponse({ description: 'Wireframe snapshot with screens' })
  @ApiNotFoundResponse({ description: 'Wireframe not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getById(
    @Param('wireframeId') wireframeId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.getById(wireframeId, user);
  }

  @Post('project/:projectId/export')
  @SkipResponseWrap()
  @ApiOperation({ summary: 'Export wireframes as JSON or PDF' })
  @ApiCreatedResponse({ description: 'Wireframe export generated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Project or wireframe not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async exportWireframe(
    @Param('projectId') projectId: string,
    @Body() payload: ExportWireframeDto,
    @CurrentUser() user: CurrentUserShape,
    @Res() res: Response,
  ) {
    const result = await this.wireframesService.exportWireframe(
      projectId,
      payload.wireframeSnapshotId,
      payload.format,
      user,
    );

    if (payload.format === ExportFormat.JSON) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="wireframe-v${result.version}.json"`,
      );
      res.send(JSON.stringify(result.data, null, 2));
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="wireframe-v${result.version}.pdf"`,
      );
      res.send(result.data);
    }
  }
}
