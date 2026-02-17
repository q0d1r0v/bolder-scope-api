import { Injectable } from '@nestjs/common';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { paginate } from '@/common/helpers/pagination.helper';
import { GenerateEstimateDto } from '@/modules/estimates/dto/generate-estimate.dto';

@Injectable()
export class EstimatesService {
  generate(payload: GenerateEstimateDto) {
    return { message: 'Estimate generation placeholder', payload };
  }

  listByProject(projectId: string, query: PaginationQueryDto) {
    void projectId;
    return paginate([], 0, query);
  }

  getLatest(projectId: string) {
    return { message: 'Latest estimate placeholder', projectId };
  }
}
