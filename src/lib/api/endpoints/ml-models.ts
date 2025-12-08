import { APIClient, ApiError, SSEEvent } from '../client';
import {
  MLModelPageResponse,
  MLModelResponse,
  MLModelVersionPageResponse,
} from '../types';

const ML_MODELS_PREFIX = '/ml_models';

export const getModels = async (): Promise<MLModelPageResponse> => {
  try {
    const response =
      await APIClient.external.get<MLModelPageResponse>(ML_MODELS_PREFIX);
    return response;
  } catch (error) {
    console.error(`Failed for getModels:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Failed to get models');
  }
};

export const getModelById = async (
  modelId: number,
): Promise<MLModelResponse> => {
  try {
    const response = await APIClient.external.get<MLModelResponse>(
      `${ML_MODELS_PREFIX}/${modelId}`,
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

export const getModelVersions = async (
  modelId: number,
): Promise<MLModelVersionPageResponse> => {
  try {
    const response = await APIClient.external.get<MLModelVersionPageResponse>(
      `${ML_MODELS_PREFIX}/${modelId}/versions`,
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
    const response = await APIClient.external.post<MLModelResponse>(
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

export const invokeTraining = async function* (
  mlBackendId: number,
  taskIds: number[],
  modelVersionID?: number,
): AsyncGenerator<SSEEvent<string>, void, unknown> {
  try {
    const response = APIClient.external.postStream<string>(
      `${ML_MODELS_PREFIX}/${mlBackendId}/train`,
      {
        data: {
          task_ids: taskIds,
          ml_model_version: modelVersionID,
        },
        query: {
          stream: true,
        },
      },
    );
    yield* response;
  } catch (error) {
    console.error('Failed to invoke training for model');
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Failed to invoke training for model');
  }
};
