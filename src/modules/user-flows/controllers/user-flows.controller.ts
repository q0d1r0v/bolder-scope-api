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
import { GenerateUserFlowDto } from '@/modules/user-flows/dto/generate-user-flow.dto';
import { UserFlowsService } from '@/modules/user-flows/services/user-flows.service';

@ApiTags('User Flows')
@ApiBearerAuth('bearer')
@Controller('user-flows')
export class UserFlowsController {
  constructor(private readonly userFlowsService: UserFlowsService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate user flows from project requirements',
  })
  @ApiCreatedResponse({ description: 'User flow snapshot generated' })
  @ApiBadRequestResponse({ description: 'Validation failed or no requirements found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  generate(
    @Body() payload: GenerateUserFlowDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.userFlowsService.generate(payload, user);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'List user flow snapshots for a project' })
  @ApiOkResponse({ description: 'Paginated list of user flow snapshots' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  listByProject(
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.userFlowsService.listByProject(projectId, query, user);
  }

  @Get('project/:projectId/latest')
  @ApiOperation({ summary: 'Get the latest user flow snapshot for a project' })
  @ApiOkResponse({ description: 'Latest user flow snapshot with screens and transitions' })
  @ApiNotFoundResponse({ description: 'Project or user flow not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getLatest(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.userFlowsService.getLatest(projectId, user);
  }

  @Get(':userFlowId')
  @ApiOperation({ summary: 'Get a specific user flow snapshot by ID' })
  @ApiOkResponse({ description: 'User flow snapshot with screens and transitions' })
  @ApiNotFoundResponse({ description: 'User flow not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getById(
    @Param('userFlowId') userFlowId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.userFlowsService.getById(userFlowId, user);
  }
}
