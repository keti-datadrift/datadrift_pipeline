import { ApiError } from 'next/dist/server/api-utils';
import apiClientInstance from '../../client';

import { Project } from '../../types';

export const getProjects = async (): Promise<Project[]> => {
  try {
    const response = await apiClientInstance.get<Project[]>('/projects');
    return response;
  } catch (error) {
    console.error('Failed to getProjects:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Failed to get label studio projects');
  }
};
