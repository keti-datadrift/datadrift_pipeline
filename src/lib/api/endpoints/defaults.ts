// Obtain access/refresh tokens using email and password (Basic Auth)
import APIClient from '@/api/client';
import { APIError } from '@/api/types';
import { DefaultModel, ModelType, ModelVersion } from '@/entities/ml-model';

export const getDefaultModels = async (): Promise<
  Record<string, DefaultModel>
> => {
  try {
    return await APIClient.external.get<Record<string, DefaultModel>>(
      '/ml_models/defaults',
    );
  } catch (error) {
    if (error instanceof APIError) {
      // APIClient에서 발생시킨 에러는 그대로 전달
      throw error;
    }
    // 그 외 네트워크 에러 등
    throw new APIError(0, 'Failed to fetch current user');
  }
};

export const getDefaultModelFor = async (
  type: ModelType,
): Promise<Record<string, DefaultModel>> => {
  try {
    return await APIClient.external.get<Record<string, DefaultModel>>(
      `/ml_models/defaults/${type}`,
    );
  } catch (error) {
    if (error instanceof APIError) {
      // APIClient에서 발생시킨 에러는 그대로 전달
      throw error;
    }
    // 그 외 네트워크 에러 등
    throw new APIError(0, 'Failed to fetch current user');
  }
};

export const updateDefaultModelFor = async (
  type: ModelType,
  modelVersionID: string,
): Promise<{ detail: string }> => {
  try {
    return await APIClient.external.put<{ detail: string }>(
      `/ml_models/defaults/${type}`,
      {
        data: {
          model_version_id: modelVersionID,
        },
      },
    );
  } catch (error) {
    if (error instanceof APIError) {
      // APIClient에서 발생시킨 에러는 그대로 전달
      throw error;
    }
    // 그 외 네트워크 에러 등
    throw new APIError(0, 'Failed to fetch current user');
  }
};

export const getVersionsByType = async (
  type: ModelType,
): Promise<ModelVersion[]> => {
  try {
    return await APIClient.external.get<ModelVersion[]>(
      `/ml_models/types/${type}/versions`,
    );
  } catch (error) {
    if (error instanceof APIError) {
      // APIClient에서 발생시킨 에러는 그대로 전달
      throw error;
    }
    // 그 외 네트워크 에러 등
    throw new APIError(0, 'Failed to fetch current user');
  }
};
