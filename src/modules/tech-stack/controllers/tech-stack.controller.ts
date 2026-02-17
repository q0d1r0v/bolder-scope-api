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
import { GenerateTechStackDto } from '@/modules/tech-stack/dto/generate-tech-stack.dto';
import { TechStackService } from '@/modules/tech-stack/services/tech-stack.service';

@ApiTags('Tech Stack')
@ApiBearerAuth('bearer')
@Controller('tech-stacks')
export class TechStackController {
  constructor(private readonly techStackService: TechStackService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate tech stack recommendations for a project' })
  @ApiCreatedResponse({ description: 'Tech stack recommendation generated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  generate(@Body() payload: GenerateTechStackDto) {
    return this.techStackService.generate(payload);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'List tech stack recommendations for a project' })
  @ApiOkResponse({ description: 'Paginated list of tech stack recommendations' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  listByProject(@Param('projectId') projectId: string, @Query() query: PaginationQueryDto) {
    return this.techStackService.listByProject(projectId, query);
  }
}
