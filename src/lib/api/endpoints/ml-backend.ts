import { APIClient } from '../client';
import { APIError, MLBackendsResponse } from '../types';

export const getMLBackends = async (
  projectId: string | number,
): Promise<MLBackendsResponse> => {
  try {
    return await APIClient.external.get<MLBackendsResponse>('/ml', {
      query: {
        project: projectId,
      },
    });
  } catch (error) {
    console.error('Failed to getMLBackends:', error);
    if (error instanceof APIError) throw error;
    throw new APIError(0, 'Failed to fetch ML Backends');
  }
};
