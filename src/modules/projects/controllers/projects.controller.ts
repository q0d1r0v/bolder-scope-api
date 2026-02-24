import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
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
  @ApiForbiddenResponse({ description: 'Not a member of this organization' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  create(
    @Body() payload: CreateProjectDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.projectsService.create(payload, user);
  }

  @Get()
  @ApiOperation({ summary: 'List projects accessible to the current user' })
  @ApiOkResponse({ description: 'Paginated list of projects' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.projectsService.findAll(user, query);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get project details by ID' })
  @ApiOkResponse({ description: 'Project details' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  findOne(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.projectsService.findOne(projectId, user);
  }

  @Post(':projectId/inputs')
  @ApiOperation({ summary: 'Add an input (text/voice/form) to a project' })
  @ApiCreatedResponse({ description: 'Input added successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  addInput(
    @Param('projectId') projectId: string,
    @Body() payload: AddProjectInputDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.projectsService.addInput(projectId, payload, user);
  }

  @Patch(':projectId/status')
  @ApiOperation({ summary: 'Update project status' })
  @ApiOkResponse({ description: 'Project status updated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Insufficient project role' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  updateStatus(
    @Param('projectId') projectId: string,
    @Body() payload: UpdateProjectStatusDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.projectsService.updateStatus(projectId, payload, user);
  }
}
