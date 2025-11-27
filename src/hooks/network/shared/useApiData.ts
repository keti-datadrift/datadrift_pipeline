import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Generic hook for fetching data from API endpoints
 * @template TResponse - The raw API response type
 * @template TEntity - The transformed entity type for UI consumption
 */
export function useApiData<TResponse, TEntity>({
  fetchFn,
  transformFn,
  errorMessage = 'Failed to fetch data',
  initialData,
  autoFetch = true,
  deps = [],
}: {
  /**
   * Function that fetches data from the API
   */
  fetchFn: () => Promise<{ items: TResponse[] } | TResponse[]>;
  /**
   * Function that transforms API response to UI entity
   */
  transformFn: (response: TResponse) => TEntity;
  /**
   * Custom error message for failed requests
   */
  errorMessage?: string;
  /**
   * Initial data to populate the state
   */
  initialData?: TEntity[];
  /**
   * Whether to automatically fetch data on mount
   */
  autoFetch?: boolean;
  /**
   * Dependencies that should trigger a refetch
   */
  deps?: unknown[];
}): {
  data: TEntity[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<TEntity[]>(initialData || []);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Cancel previous request if it exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);

      const response = await fetchFn();

      // Check if request was aborted before updating state
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      // Handle both array responses and paginated responses with items property
      const items = Array.isArray(response) ? response : response.items;

      const transformedData = items.map(transformFn);
      setData(transformedData);
    } catch (err) {
      // Check if request was aborted before updating state
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const message = err instanceof Error ? err.message : errorMessage;
      setError(message);
      console.error(`${errorMessage}:`, err);
    } finally {
      // Check if request was aborted before updating state
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  }, [fetchFn, transformFn, errorMessage]);

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }

    // Cleanup function to abort request on unmount or dependency change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [autoFetch, fetchData, ...deps]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Generic hook for fetching a single item by ID
 * @template TResponse - The raw API response type
 * @template TEntity - The transformed entity type for UI consumption
 */
export function useApiItem<TResponse, TEntity>({
  fetchFn,
  transformFn,
  errorMessage = 'Failed to fetch item',
  autoFetch = true,
  deps = [],
}: {
  /**
   * Function that fetches a single item from the API
   */
  fetchFn: () => Promise<TResponse>;
  /**
   * Function that transforms API response to UI entity
   */
  transformFn: (response: TResponse) => TEntity;
  /**
   * Custom error message for failed requests
   */
  errorMessage?: string;
  /**
   * Whether to automatically fetch data on mount
   */
  autoFetch?: boolean;
  /**
   * Dependencies that should trigger a refetch
   */
  deps?: unknown[];
}): {
  data: TEntity | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<TEntity | null>(null);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Cancel previous request if it exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);

      const response = await fetchFn();

      // Check if request was aborted before updating state
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const transformedData = transformFn(response);
      setData(transformedData);
    } catch (err) {
      // Check if request was aborted before updating state
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const message = err instanceof Error ? err.message : errorMessage;
      setError(message);
      console.error(`${errorMessage}:`, err);
    } finally {
      // Check if request was aborted before updating state
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  }, [fetchFn, transformFn, errorMessage]);

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }

    // Cleanup function to abort request on unmount or dependency change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [autoFetch, fetchData, ...deps]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { data, loading, error, refetch: fetchData };
}

// Overload for single parameter without transform
export function useApiMutation<
  TRequest = unknown,
  TResponse = unknown,
>(config: {
  mutationFn: (data: TRequest) => Promise<TResponse>;
  onSuccess?: (data: TResponse) => void;
  onError?: (error: Error) => void;
}): {
  mutate: (data: TRequest) => Promise<TResponse>;
  loading: boolean;
  error: string | null;
};

// Overload for single parameter with transform
export function useApiMutation<
  TRequest = unknown,
  TResponse = unknown,
  TEntity = TResponse,
>(config: {
  mutationFn: (data: TRequest) => Promise<TResponse>;
  transformFn: (response: TResponse) => TEntity;
  onSuccess?: (data: TEntity) => void;
  onError?: (error: Error) => void;
}): {
  mutate: (data: TRequest) => Promise<TEntity>;
  loading: boolean;
  error: string | null;
};

// Overload for multiple parameters without transform
export function useApiMutation<
  TArgs extends any[],
  TResponse = unknown,
>(config: {
  mutationFn: (...args: TArgs) => Promise<TResponse>;
  onSuccess?: (data: TResponse) => void;
  onError?: (error: Error) => void;
}): {
  mutate: (...args: TArgs) => Promise<TResponse>;
  loading: boolean;
  error: string | null;
};

// Overload for multiple parameters with transform
export function useApiMutation<
  TArgs extends any[],
  TResponse = unknown,
  TEntity = TResponse,
>(config: {
  mutationFn: (...args: TArgs) => Promise<TResponse>;
  transformFn: (response: TResponse) => TEntity;
  onSuccess?: (data: TEntity) => void;
  onError?: (error: Error) => void;
}): {
  mutate: (...args: TArgs) => Promise<TEntity>;
  loading: boolean;
  error: string | null;
};

/**
 * Unified hook for API operations with mutations (create, update, delete)
 * Supports both single parameter and multiple parameter patterns
 * Optionally transforms API response to UI entity using transformFn
 *
 * @template TRequest - The request payload type (for single parameter)
 * @template TArgs - The arguments tuple type (for multiple parameters)
 * @template TResponse - The raw API response type
 * @template TEntity - The transformed entity type for UI consumption
 *
 * @example
 * // Single parameter pattern without transform
 * const { mutate } = useApiMutation({
 *   mutationFn: (data: CreateUserRequest) => createUser(data)
 * });
 * mutate(userData);
 *
 * @example
 * // Multiple parameters pattern with transform
 * const { mutate } = useApiMutation({
 *   mutationFn: (id: string, data: UpdateUserRequest) => updateUser(id, data),
 *   transformFn: (response) => ({ ...response, displayName: response.name })
 * });
 * mutate(userId, userData);
 */
export function useApiMutation<
  TArgs extends any[] = [unknown],
  TResponse = unknown,
  TEntity = TResponse,
>({
  mutationFn,
  transformFn,
  onSuccess,
  onError,
}: {
  mutationFn: (...args: TArgs) => Promise<TResponse>;
  transformFn?: (response: TResponse) => TEntity;
  onSuccess?: (data: TEntity) => void;
  onError?: (error: Error) => void;
}): {
  mutate: (...args: TArgs) => Promise<TEntity>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (...args: TArgs): Promise<TEntity> => {
      try {
        setLoading(true);
        setError(null);

        const response = await mutationFn(...args);
        const transformedData = transformFn
          ? transformFn(response)
          : (response as unknown as TEntity);

        if (onSuccess) {
          onSuccess(transformedData);
        }

        return transformedData;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Mutation failed';
        setError(errorMessage);

        if (onError && err instanceof Error) {
          onError(err);
        }

        console.error('Mutation failed:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [mutationFn, transformFn, onSuccess, onError],
  );

  return { mutate, loading, error };
}
