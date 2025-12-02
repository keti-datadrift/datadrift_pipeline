import { getModelById, getModelVersions, getModels } from '@/api/endpoints';
import { invokeTraining } from '@/api/endpoints/ml-models';
import {
  APIError,
  MLModelResponse,
  MLModelVersionResponse,
  TrainingProgressResponse,
} from '@/api/types';
import { Model, ModelVersion } from '@/entities/ml-model';
import { TrainingProgress, TrainingStatus } from '@/entities/train';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiData, useApiItem } from './shared/useApiData';

/**
 * Custom hook for managing models data
 */
export function useModels(): {
  data: Model[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  return useApiData<MLModelResponse, Model>({
    fetchFn: getModels,
    transformFn: MLModelResponse.toEntity,
    errorMessage: 'Failed to fetch models',
  });
}

/**
 * Hook for fetching a single model by ID
 */
export function useModel(modelID: number): {
  data: ModelVersion[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const fetchFn = useCallback(() => getModelById(modelID), [modelID]);

  return useApiItem<MLModelResponse, Model>({
    fetchFn,
    transformFn: MLModelResponse.toEntity,
    errorMessage: `Failed to fetch model with ID: ${modelID}`,
  });
}

/**
 * Custom hook for fetching versions of model by ID
 */
export function useModelVersions(modelID: number | undefined): {
  data: ModelVersion[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const shouldFetch = modelID !== undefined;

  const fetchFn = useCallback(() => {
    if (!shouldFetch) {
      return Promise.reject(new APIError(404, 'Model ID is required'));
    }
    return getModelVersions(modelID);
  }, [shouldFetch, modelID]);

  const { data, loading, error, refetch } = useApiData<
    MLModelVersionResponse,
    ModelVersion
  >({
    fetchFn,
    transformFn: MLModelVersionResponse.toEntity,
    errorMessage: `Failed to fetch model with ID: ${modelID}`,
    deps: [modelID],
  });

  return {
    data,
    loading,
    error: shouldFetch ? error : '',
    refetch: shouldFetch ? refetch : async () => {},
  };
}

export function useTrain(
  mlBackendID: number,
  taskIDs: number[],
  modelVersionID?: number,
): {
  data: TrainingProgress | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  reset: () => void;
} {
  const [data, setData] = useState<TrainingProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Keep last non-null metrics for the current run only
  const lastMetricsRef = useRef<NonNullable<
    TrainingProgress['metrics']
  > | null>(null);

  const startTraining = useCallback(async () => {
    if (loading) return;

    setError(null);

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      console.log(
        '🚀 Starting training stream for model:',
        mlBackendID,
        'tasks:',
        taskIDs,
        'modelVersionID:',
        modelVersionID,
      );
      const generator = invokeTraining(mlBackendID, taskIDs, modelVersionID);

      let eventCount = 0;
      for await (const event of generator) {
        eventCount++;
        console.log(`📡 SSE Event #${eventCount}:`, {
          data: event.data,
          type: typeof event.data,
          event: event.event,
          id: event.id,
          timestamp: new Date().toISOString(),
        });

        // Check if request was aborted
        if (abortControllerRef.current?.signal.aborted) {
          console.log('❌ Training stream aborted');
          break;
        }

        try {
          // Handle the SSE event data - it might already be an object or a JSON string
          let progressData: TrainingProgressResponse;

          if (typeof event.data === 'string') {
            // If it's a string, parse it as JSON
            progressData = JSON.parse(event.data) as TrainingProgressResponse;
          } else if (typeof event.data === 'object' && event.data !== null) {
            // If it's already an object, use it directly
            progressData = event.data as TrainingProgressResponse;
          } else {
            console.warn(
              'Unexpected event data type:',
              typeof event.data,
              event.data,
            );
            continue;
          }

          // Transform to entity using the response transformer
          const trainingProgress =
            TrainingProgressResponse.toEntity(progressData);

          // Update last non-null metrics when provided
          if (trainingProgress?.metrics) {
            lastMetricsRef.current = trainingProgress.metrics;
          }

          // Preserve metrics only for terminal statuses to avoid leaking old data at run start
          if (
            trainingProgress &&
            trainingProgress.metrics == null &&
            (trainingProgress.status === TrainingStatus.TRAINING_COMPLETED ||
              trainingProgress.status === TrainingStatus.TRAINING_FAILED) &&
            lastMetricsRef.current
          ) {
            setData({ ...trainingProgress, metrics: lastMetricsRef.current });
          } else {
            setData(trainingProgress);
          }
        } catch (parseError) {
          console.warn('Failed to parse training progress data:', parseError);
          console.warn('Event data was:', event.data);
          // Continue processing other events even if one fails to parse
        }
      }
    } catch (err) {
      if (!abortControllerRef.current?.signal.aborted) {
        const errorMessage =
          err instanceof APIError ? err.message : 'Failed to start training';
        setError(errorMessage);
      }
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  }, [mlBackendID, taskIDs, modelVersionID, loading]);

  const refetch = useCallback(async () => {
    // New run: clear current data and last metrics snapshot
    setData(null);
    lastMetricsRef.current = null;
    setLoading(true);
    await startTraining();
  }, [startTraining]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    lastMetricsRef.current = null;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    refetch,
    reset,
  };
}
