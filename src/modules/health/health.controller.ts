import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { SkipResponseWrap } from '@/common/decorators/skip-response-wrap.decorator';
import { HealthService } from '@/modules/health/health.service';

@ApiTags('Health')
@Public()
@SkipResponseWrap()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check API health status' })
  @ApiOkResponse({ description: 'API is healthy' })
  getHealth() {
    return this.healthService.check();
  }
}
