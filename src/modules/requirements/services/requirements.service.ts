import { Injectable } from '@nestjs/common';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { paginate } from '@/common/helpers/pagination.helper';
import { GenerateRequirementDto } from '@/modules/requirements/dto/generate-requirement.dto';
import { UpdateRequirementDto } from '@/modules/requirements/dto/update-requirement.dto';

@Injectable()
export class RequirementsService {
  generate(payload: GenerateRequirementDto) {
    return { message: 'Requirement generation placeholder', payload };
  }

  update(requirementId: string, payload: UpdateRequirementDto) {
    return { message: 'Requirement update placeholder', requirementId, payload };
  }

  listByProject(projectId: string, query: PaginationQueryDto) {
    void projectId;
    return paginate([], 0, query);
  }
}
