import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
import { AddProjectInputDto } from '@/modules/projects/dto/add-project-input.dto';
import { CreateProjectDto } from '@/modules/projects/dto/create-project.dto';
import { UpdateProjectStatusDto } from '@/modules/projects/dto/update-project-status.dto';
import { ProjectsService } from '@/modules/projects/services/projects.service';

@ApiTags('Projects')
@ApiBearerAuth('bearer')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiCreatedResponse({ description: 'Project created successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  create(@Body() payload: CreateProjectDto) {
    return this.projectsService.create(payload);
  }

  @Get()
  @ApiOperation({ summary: 'List projects accessible to the current user' })
  @ApiOkResponse({ description: 'Paginated list of projects' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.projectsService.findAll(query);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get project details by ID' })
  @ApiOkResponse({ description: 'Project details' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  findOne(@Param('projectId') projectId: string) {
    return this.projectsService.findOne(projectId);
  }

  @Post(':projectId/inputs')
  @ApiOperation({ summary: 'Add an input (text/voice/form) to a project' })
  @ApiCreatedResponse({ description: 'Input added successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  addInput(
    @Param('projectId') projectId: string,
    @Body() payload: AddProjectInputDto,
  ) {
    return this.projectsService.addInput(projectId, payload);
  }

  @Patch(':projectId/status')
  @ApiOperation({ summary: 'Update project status' })
  @ApiOkResponse({ description: 'Project status updated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  updateStatus(
    @Param('projectId') projectId: string,
    @Body() payload: UpdateProjectStatusDto,
  ) {
    return this.projectsService.updateStatus(projectId, payload);
  }
}
