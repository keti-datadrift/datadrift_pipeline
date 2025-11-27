import apiClientInstance, { ApiError } from '../client';
import { MLModelPageResponse, MLModelVersionPageResponse } from '../types';

export const getModels = async (): Promise<MLModelPageResponse> => {
  try {
    const response =
      await apiClientInstance.get<MLModelPageResponse>('/models');
    return response;
  } catch (error) {
    console.error(`Failed for getModels:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Failed to get models');
  }
};

export const getModelById = async (
  modelId: number,
): Promise<MLModelVersionPageResponse> => {
  try {
    const response = await apiClientInstance.get<MLModelVersionPageResponse>(
      `/models/${modelId}`,
    );
    return response;
  } catch (error) {
    console.error(`Failed for getModelById (id: ${modelId}):`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      `Failed to get model by id: ${modelId}. Details: ${String(error)}`,
    );
  }
};

export const selectModelVersion = async (
  modelId: number,
  version: string,
): Promise<MLModelResponse> => {
  try {
    const response = await APIClient.labelstudio.post<MLModelResponse>(
      `${ML_MODELS_PREFIX}/${modelId}/select`,
      {
        data: { version },
      },
    );
    return response;
  } catch (error) {
    console.error(
      `Failed for selectModelVersion (id: ${modelId}, version: ${version}):`,
      error,
    );
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      `Failed to select model version ${version} by id: ${modelId}. Details: ${String(error)}`,
    );
  }
};
