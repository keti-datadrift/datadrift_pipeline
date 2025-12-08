import { APIClient } from '../client';
import {
  UpdateProjectRequest,
  UpdateProjectResponse,
  UploadTasksOptions,
} from '../models/projects';
import { APIError, ProjectPageResponse } from '../types';

// Re-export for convenience
export type { UploadTasksOptions };

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
    const response = await APIClient.external.get<ProjectPageResponse>(
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
    const response = await APIClient.external.patch<UpdateProjectResponse>(
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

/**
 * Upload files to a project using multipart form data
 * @param id - Project ID
 * @param files - Array of files to upload
 * @param options - Optional upload configuration
 */
export const uploadTasks = async (
  id: string,
  files: File[],
  options?: UploadTasksOptions,
): Promise<void> => {
  try {
    const formData = new FormData();
    const { fieldName = 'files', additionalData = {} } = options || {};

    // Add all files to the form data
    files.forEach((file, index) => {
      // Use array notation for multiple files or single field name for one file
      const name = files.length > 1 ? `${fieldName}[${index}]` : fieldName;
      formData.append(name, file);
    });

    // Add any additional form data
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, String(value));
    });

    await APIClient.external.post<void>(`/projects/${id}/import`, {
      data: formData,
    });
  } catch (error) {
    console.error('Failed to uploadTasks:', error);
    if (error instanceof APIError) throw error;
    throw new APIError(0, 'Failed to upload tasks');
  }
};
