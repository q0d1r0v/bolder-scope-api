import { Injectable } from '@nestjs/common';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { paginate } from '@/common/helpers/pagination.helper';
import { GenerateTechStackDto } from '@/modules/tech-stack/dto/generate-tech-stack.dto';

@Injectable()
export class TechStackService {
  generate(payload: GenerateTechStackDto) {
    return { message: 'Tech stack recommendation placeholder', payload };
  }

  listByProject(projectId: string, query: PaginationQueryDto) {
    void projectId;
    return paginate([], 0, query);
  }
}
