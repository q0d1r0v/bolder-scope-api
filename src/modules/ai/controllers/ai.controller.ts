import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { CreateAiRunDto } from '@/modules/ai/dto/create-ai-run.dto';
import { AiService } from '@/modules/ai/services/ai.service';

@ApiTags('AI')
@ApiBearerAuth('bearer')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('runs')
  @ApiOperation({ summary: 'Create a new AI run for a project task' })
  @ApiCreatedResponse({ description: 'AI run created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  createRun(@Body() payload: CreateAiRunDto) {
    return this.aiService.createRun(payload);
  }

  @Get('runs')
  @ApiOperation({ summary: 'List AI runs, optionally filtered by project' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Filter by project ID' })
  @ApiOkResponse({ description: 'Paginated list of AI runs' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  listRuns(@Query() query: PaginationQueryDto, @Query('projectId') projectId?: string) {
    return this.aiService.listRuns(query, projectId);
  }
}
