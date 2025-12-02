// Model Version interfaces and types for API responses

import { ModelVersion } from '@/entities/ml-model';
import { PaginatedResponse } from './pagination';
import { formatRelativeTime } from '@/utils/time.util';

export interface MLModelVersionResponse {
  id: number;
  ml_model: number;
  trained_at: string;
  weight: string;
  version: string;
  training_args?: Record<string, any>;
  metrics?: Record<string, any>;
  notes?: string;
}

export type GetMLModelVersionsResponse =
  PaginatedResponse<MLModelVersionResponse>;

export namespace MLModelVersionResponse {
  export function toEntity(response: MLModelVersionResponse): ModelVersion {
    return {
      id: response.id,
      version: response.version,
      trainedAt: formatRelativeTime(response.trained_at),
      trainingMetrics: trainingMetrics,
      modelId: response.ml_model,
    };
  }
}
