import {
  Body,
  Controller,
  Get,
  Param,
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
import { GenerateCodeDto } from '@/modules/code-generation/dto/generate-code.dto';
import {
  CodeExportFormat,
  ExportCodeDto,
} from '@/modules/code-generation/dto/export-code.dto';
import { CodeGenerationService } from '@/modules/code-generation/services/code-generation.service';

@ApiTags('Code Generation')
@ApiBearerAuth('bearer')
@Controller('code-generation')
export class CodeGenerationController {
  constructor(
    private readonly codeGenerationService: CodeGenerationService,
  ) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate project code from requirements, wireframes and tech stack',
  })
  @ApiCreatedResponse({ description: 'Code generation snapshot created' })
  @ApiBadRequestResponse({
    description: 'Validation failed or missing dependencies',
  })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  generate(
    @Body() payload: GenerateCodeDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.codeGenerationService.generate(payload, user);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'List code generation snapshots for a project' })
  @ApiOkResponse({
    description: 'Paginated list of code generation snapshots',
  })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  listByProject(
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.codeGenerationService.listByProject(projectId, query, user);
  }

  @Get('project/:projectId/latest')
  @ApiOperation({
    summary: 'Get the latest code generation snapshot for a project',
  })
  @ApiOkResponse({
    description: 'Latest code generation snapshot with file list',
  })
  @ApiNotFoundResponse({ description: 'Project or snapshot not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getLatest(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.codeGenerationService.getLatest(projectId, user);
  }

  @Get(':codeGenId')
  @ApiOperation({ summary: 'Get a specific code generation snapshot by ID' })
  @ApiOkResponse({ description: 'Code generation snapshot with file list' })
  @ApiNotFoundResponse({ description: 'Snapshot not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getById(
    @Param('codeGenId') codeGenId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.codeGenerationService.getById(codeGenId, user);
  }

  @Get(':codeGenId/files')
  @ApiOperation({
    summary: 'Get all generated files for a code generation snapshot',
  })
  @ApiOkResponse({ description: 'List of generated files with content' })
  @ApiNotFoundResponse({ description: 'Snapshot not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getFiles(
    @Param('codeGenId') codeGenId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.codeGenerationService.getFiles(codeGenId, user);
  }

  @Get(':codeGenId/files/:fileId')
  @ApiOperation({ summary: 'Get a single generated file by ID' })
  @ApiOkResponse({ description: 'Generated file with content' })
  @ApiNotFoundResponse({ description: 'Snapshot or file not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getFileById(
    @Param('codeGenId') codeGenId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.codeGenerationService.getFileById(codeGenId, fileId, user);
  }

  @Post('project/:projectId/export')
  @SkipResponseWrap()
  @ApiOperation({ summary: 'Export generated code as ZIP or JSON' })
  @ApiCreatedResponse({ description: 'Code export generated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Project or snapshot not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async exportCode(
    @Param('projectId') projectId: string,
    @Body() payload: ExportCodeDto,
    @CurrentUser() user: CurrentUserShape,
    @Res() res: Response,
  ) {
    const result = await this.codeGenerationService.exportCode(
      projectId,
      payload.codeGenSnapshotId,
      payload.format,
      user,
    );

    if (payload.format === CodeExportFormat.JSON) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="code-v${result.version}.json"`,
      );
      res.send(JSON.stringify(result.data, null, 2));
    } else {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="code-v${result.version}.zip"`,
      );
      res.send(result.data);
    }
  }
}
