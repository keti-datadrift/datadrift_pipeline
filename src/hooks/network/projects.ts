import { Project } from '@/entities/labelstudio';
import { getProjects, updateProject } from '@/lib/api/endpoints';
import { useCallback } from 'react';
import { useApiData, useApiMutation } from './shared/useApiData';
import {
  UpdateProjectRequest,
  UpdateProjectResponse,
} from '@/lib/api/models/projects';
import { ModelType } from '@/entities/ml-model';

/**
 * Custom hook for getting projects data
 */
export function useProjects(): {
  data: Project[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const fetchFn = useCallback(() => getProjects(), []);

  return useApiData<ProjectResponse, Project>({
    fetchFn,
    transformFn: ProjectResponse.toEntity,
    errorMessage: 'Failed to fetch models',
  });
}

type UpdatedProject = {
  title: string;
  type: ModelType;
  color: string;
};

export function useUpdateProject(): {
  requestFn: (project: Project, data: UpdateProjectRequest) => Promise<Project>;
  loading: boolean;
  error: string | null;
} {
  const {
    mutate: updateProjectMutation,
    loading,
    error,
  } = useApiMutation<
    [Project, UpdateProjectRequest],
    UpdateProjectResponse,
    UpdatedProject
  >({
    mutationFn: (project: Project, data: UpdateProjectRequest) =>
      updateProject(project.id, data),
    transformFn: (response: UpdateProjectResponse): UpdatedProject => {
      return {
        title: response.title || '',
        type: ModelType.fromString(response.ml_model_type || ''),
        color: response.color || '#ffffff',
      };
    },
  });

  // Create a wrapper that captures project id and sets it in the result
  const updateProjectWithId = useCallback(
    async (project: Project, data: UpdateProjectRequest): Promise<Project> => {
      const result = await updateProjectMutation(project, data);
      return {
        ...project,
        ...result,
      };
    },
    [updateProjectMutation],
  );

  return {
    requestFn: updateProjectWithId,
    loading,
    error,
  };
}
