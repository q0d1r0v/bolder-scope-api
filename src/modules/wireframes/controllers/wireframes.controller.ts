import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
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
import { TextToDesignDto } from '@/modules/wireframes/dto/text-to-design.dto';
import {
  ExportFormat,
  ExportWireframeDto,
} from '@/modules/wireframes/dto/export-wireframe.dto';
import { RefineScreenDto } from '@/modules/wireframes/dto/refine-screen.dto';
import { RegenerateScreenDto } from '@/modules/wireframes/dto/regenerate-screen.dto';
import { AddScreenDto } from '@/modules/wireframes/dto/add-screen.dto';
import { ApplyStyleDto } from '@/modules/wireframes/dto/apply-style.dto';
import { ReorderScreensDto } from '@/modules/wireframes/dto/reorder-screens.dto';
import { RegenerateDesignSystemDto } from '@/modules/wireframes/dto/regenerate-design-system.dto';
import { WireframesService } from '@/modules/wireframes/services/wireframes.service';

@ApiTags('Wireframes')
@ApiBearerAuth('bearer')
@Controller('wireframes')
export class WireframesController {
  constructor(private readonly wireframesService: WireframesService) {}

  // ─── GENERATION ───

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

  @Post('text-to-design')
  @ApiOperation({
    summary: 'Generate a full UI design from a text description',
    description:
      'Takes a text prompt describing an application and generates a complete premium UI design with screens, components, design system (with dark mode), and navigation flow.',
  })
  @ApiCreatedResponse({ description: 'Design generated from text prompt' })
  @ApiBadRequestResponse({ description: 'Validation failed or AI processing error' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  generateFromText(
    @Body() payload: TextToDesignDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.generateFromText(payload, user);
  }

  // ─── SCREEN REFINEMENT ───

  @Post(':snapshotId/screens/:screenId/refine')
  @ApiOperation({
    summary: 'Refine a single screen with AI',
    description: 'Modify specific parts of a screen layout based on natural language instruction.',
  })
  @ApiCreatedResponse({ description: 'Screen refined successfully' })
  @ApiNotFoundResponse({ description: 'Snapshot or screen not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  refineScreen(
    @Param('snapshotId') snapshotId: string,
    @Param('screenId') screenId: string,
    @Body() payload: RefineScreenDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.refineScreen(snapshotId, screenId, payload, user);
  }

  @Post(':snapshotId/screens/:screenId/regenerate')
  @ApiOperation({
    summary: 'Regenerate a screen from scratch',
    description: 'Completely regenerate a screen layout while keeping the design system.',
  })
  @ApiCreatedResponse({ description: 'Screen regenerated successfully' })
  @ApiNotFoundResponse({ description: 'Snapshot or screen not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  regenerateScreen(
    @Param('snapshotId') snapshotId: string,
    @Param('screenId') screenId: string,
    @Body() payload: RegenerateScreenDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.regenerateScreen(snapshotId, screenId, payload, user);
  }

  // ─── SCREEN MANAGEMENT ───

  @Post(':snapshotId/screens')
  @ApiOperation({
    summary: 'Add a new AI-generated screen to an existing snapshot',
    description: 'Generate and add a new screen that fits cohesively with existing screens.',
  })
  @ApiCreatedResponse({ description: 'New screen added' })
  @ApiNotFoundResponse({ description: 'Snapshot not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  addScreen(
    @Param('snapshotId') snapshotId: string,
    @Body() payload: AddScreenDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.addScreen(snapshotId, payload, user);
  }

  @Patch(':snapshotId/screens/reorder')
  @ApiOperation({ summary: 'Reorder screens within a snapshot' })
  @ApiOkResponse({ description: 'Screens reordered' })
  @ApiNotFoundResponse({ description: 'Snapshot not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  reorderScreens(
    @Param('snapshotId') snapshotId: string,
    @Body() payload: ReorderScreensDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.reorderScreens(snapshotId, payload, user);
  }

  @Delete(':snapshotId/screens/:screenId')
  @ApiOperation({ summary: 'Delete a screen from a snapshot' })
  @ApiOkResponse({ description: 'Screen deleted' })
  @ApiNotFoundResponse({ description: 'Snapshot or screen not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  deleteScreen(
    @Param('snapshotId') snapshotId: string,
    @Param('screenId') screenId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.deleteScreen(snapshotId, screenId, user);
  }

  // ─── STYLE & DESIGN SYSTEM ───

  @Post(':snapshotId/apply-style')
  @ApiOperation({
    summary: 'Apply a style change across all screens',
    description: 'Use AI to consistently apply a visual style change to all screens in the snapshot.',
  })
  @ApiCreatedResponse({ description: 'Style applied to all screens' })
  @ApiNotFoundResponse({ description: 'Snapshot not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  applyStyle(
    @Param('snapshotId') snapshotId: string,
    @Body() payload: ApplyStyleDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.applyStyle(snapshotId, payload, user);
  }

  @Post(':snapshotId/regenerate-design-system')
  @ApiOperation({
    summary: 'Regenerate the design system for a snapshot',
    description: 'Create a new premium design system with full color palette, dark mode, typography, and more.',
  })
  @ApiCreatedResponse({ description: 'Design system regenerated' })
  @ApiNotFoundResponse({ description: 'Snapshot not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  regenerateDesignSystem(
    @Param('snapshotId') snapshotId: string,
    @Body() payload: RegenerateDesignSystemDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.regenerateDesignSystem(snapshotId, payload, user);
  }

  // ─── VERSIONING ───

  @Post(':snapshotId/fork')
  @ApiOperation({
    summary: 'Fork a snapshot to create a new version',
    description: 'Create a copy of an existing snapshot as a new version for iteration.',
  })
  @ApiCreatedResponse({ description: 'Snapshot forked' })
  @ApiNotFoundResponse({ description: 'Snapshot not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  forkSnapshot(
    @Param('snapshotId') snapshotId: string,
    @Body('instruction') instruction: string | undefined,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.wireframesService.forkSnapshot(snapshotId, instruction, user);
  }

  // ─── RETRIEVAL ───

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

  // ─── EXPORT ───

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
