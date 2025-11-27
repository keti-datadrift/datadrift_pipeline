import { APIClient } from '../client';
import {
  UpdateProjectRequest,
  UpdateProjectResponse,
} from '../models/projects';
import { APIError, ProjectPageResponse } from '../types';

export const getProjects = async (): Promise<ProjectPageResponse> => {
  try {
    const includeFields = [
      'id',
      'title',
      'color',
      'ml_model_type',
      'finished_task_number',
      'task_number',
      'total_annotations_number',
      'total_predictions_number',
    ];
    const response = await APIClient.labelstudio.get<ProjectPageResponse>(
      '/projects',
      {
        query: {
          include: includeFields.join(','),
        },
      },
    );
    return response;
  } catch (error) {
    console.error('Failed to getProjects:', error);
    if (error instanceof APIError) throw error;
    throw new APIError(0, 'Failed to get label studio projects');
  }
};

export const updateProject = async (
  id: string,
  project: UpdateProjectRequest,
): Promise<UpdateProjectResponse> => {
  try {
    const response = await APIClient.labelstudio.patch<UpdateProjectResponse>(
      `/projects/${id}`,
      {
        data: project,
      },
    );
    return response;
  } catch (error) {
    console.error('Failed to updateProject:', error);
    if (error instanceof APIError) throw error;
    throw new APIError(0, 'Failed to update label studio project');
  }
};
