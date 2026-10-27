import { APIClient } from '../client';
import { APIError, TaskPageResponse } from '../types';

const ANNOTATED_TASK_FILTER = {
  filters: {
    conjunction: 'and',
    items: [
      {
        filter: 'filter:tasks:total_annotations',
        operator: 'greater',
        type: 'Number',
        value: 0,
      },
    ],
  },
};

export const getAnnotatedTasks = async (
  projectId: string | number,
): Promise<TaskPageResponse> => {
  try {
    return await APIClient.external.get<TaskPageResponse>('/tasks', {
      query: {
        project: projectId,
        query: JSON.stringify(ANNOTATED_TASK_FILTER),
      },
    });
  } catch (error) {
    console.error('Failed to getAnnotatedTasks:', error);
    if (error instanceof APIError) throw error;
    throw new APIError(0, 'Failed to fetch annotated tasks');
  }
};
