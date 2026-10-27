import { Project } from '@/entities/labelstudio';
import { PaginatedResponse } from '../pagination';

export interface ProjectResponse {
  id: number;
  title: string;
}

export type GetProjectsResponse = PaginatedResponse<ProjectResponse>;

export namespace ProjectResponse {
  export function toEntity(response: ProjectResponse): Project {
    return {
      id: response.id.toString(),
      title: response.title,
    };
  }
}
