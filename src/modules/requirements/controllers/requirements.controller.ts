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
import { GenerateRequirementDto } from '@/modules/requirements/dto/generate-requirement.dto';
import { UpdateRequirementDto } from '@/modules/requirements/dto/update-requirement.dto';
import { RequirementsService } from '@/modules/requirements/services/requirements.service';

@ApiTags('Requirements')
@ApiBearerAuth('bearer')
@Controller('requirements')
export class RequirementsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate structured requirements from project inputs',
  })
  @ApiCreatedResponse({ description: 'Requirement snapshot generated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  generate(
    @Body() payload: GenerateRequirementDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.requirementsService.generate(payload, user);
  }

  @Patch(':requirementId')
  @ApiOperation({ summary: 'Update a requirement snapshot' })
  @ApiOkResponse({ description: 'Requirement updated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Requirement not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  update(
    @Param('requirementId') requirementId: string,
    @Body() payload: UpdateRequirementDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.requirementsService.update(requirementId, payload, user);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'List requirement snapshots for a project' })
  @ApiOkResponse({ description: 'Paginated list of requirement snapshots' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  listByProject(
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.requirementsService.listByProject(projectId, query, user);
  }
}
