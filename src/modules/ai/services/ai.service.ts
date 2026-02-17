import { Injectable } from '@nestjs/common';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { paginate } from '@/common/helpers/pagination.helper';
import { CreateAiRunDto } from '@/modules/ai/dto/create-ai-run.dto';

@Injectable()
export class AiService {
  createRun(payload: CreateAiRunDto) {
    return { message: 'AI run placeholder', payload };
  }

  listRuns(query: PaginationQueryDto, projectId?: string) {
    void projectId;
    return paginate([], 0, query);
  }
}
