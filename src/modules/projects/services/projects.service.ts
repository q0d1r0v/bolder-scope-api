import { Injectable } from '@nestjs/common';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { paginate } from '@/common/helpers/pagination.helper';
import { AddProjectInputDto } from '@/modules/projects/dto/add-project-input.dto';
import { CreateProjectDto } from '@/modules/projects/dto/create-project.dto';
import { UpdateProjectStatusDto } from '@/modules/projects/dto/update-project-status.dto';

@Injectable()
export class ProjectsService {
  create(payload: CreateProjectDto) {
    return { message: 'Project create placeholder', payload };
  }

  findAll(query: PaginationQueryDto) {
    return paginate([], 0, query);
  }

  findOne(projectId: string) {
    return { message: 'Project detail placeholder', projectId };
  }

  addInput(projectId: string, payload: AddProjectInputDto) {
    return { message: 'Project input placeholder', projectId, payload };
  }

  updateStatus(projectId: string, payload: UpdateProjectStatusDto) {
    return { message: 'Project status update placeholder', projectId, payload };
  }
}
