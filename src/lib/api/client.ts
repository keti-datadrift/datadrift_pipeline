import axios from 'axios';
import { MLModelResponse, GetMLModelsResponse } from './models/ml-models';

/** HTTP method types */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** Base request configuration */
interface BaseRequestConfig {
  /** Query parameters to append to URL */
  query?: Record<string, any>;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** AbortController signal for request cancellation */
  signal?: AbortSignal;
}

/** Configuration for requests with body (POST, PUT, PATCH) */
interface RequestWithBodyConfig extends BaseRequestConfig {
  /** Request body data */
  data?: any;
}

/** Internal request options */
type RequestOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
  query?: Record<string, any>;
};

/**
 * HTTP API client with automatic query string building, CSRF protection, and error handling
 */
export class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Builds query string from object parameters
   * Handles arrays, null/undefined values, and proper URL encoding
   */
  private buildQueryString(query?: Record<string, any>): string {
    if (!query || Object.keys(query).length === 0) return '';

    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;

      if (Array.isArray(value)) {
        value.forEach((v) => {
          if (v !== undefined && v !== null) {
            params.append(key, String(v));
          }
        });
      } else {
        params.append(key, String(value));
      }
    });

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  }

  /**
   * Internal request method with automatic error handling and response parsing
   */
  private async request<T = any>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { method = 'GET', headers = {}, body, signal, query } = options;

    // Build request headers with automatic content-type detection
    const requestHeaders: Record<string, string> = {
      ...(body instanceof FormData
        ? {} // let browser set Content-Type for FormData
        : { 'Content-Type': 'application/json' }),
      ...headers,
    };

    // Add CSRF token for state-changing requests
    if (method !== 'GET') {
      const csrfToken = getCookie('csrftoken');
      if (csrfToken) {
        requestHeaders['X-CSRFToken'] = csrfToken;
      }
    }

    // Build final URL with query parameters
    const queryString = this.buildQueryString(query);
    const normalizedEndpoint = endpoint.startsWith('/')
      ? endpoint
      : `/${endpoint}`;
    const requestUrl = `${this.baseURL}${normalizedEndpoint}${queryString}`;

    const config: RequestInit = {
      method,
      headers: requestHeaders,
      signal,
      credentials: 'include', // Include cookies for authentication
    };

    // Add body for non-GET requests
    if (body && method !== 'GET') {
      config.body = body instanceof FormData ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(requestUrl, config);

      if (!response.ok) {
        let errorData: any;
        const contentType = response.headers.get('content-type');

        try {
          if (contentType?.includes('application/json')) {
            errorData = await response.json();
          } else {
            errorData = {
              error: (await response.text()) || response.statusText,
            };
          }
        } catch {
          errorData = {
            error: `HTTP ${response.status}`,
            details: response.statusText,
          };
        }

        throw new ApiError(
          response.status,
          errorData.error || `HTTP ${response.status}`,
          errorData.details || errorData.message,
        );
      }

      // Handle empty responses
      if (
        response.status === 204 ||
        response.headers.get('content-length') === '0'
      ) {
        return {} as T;
      }

      // Parse response based on content type
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      return response.text() as unknown as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Handle network errors, timeouts, etc.
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new ApiError(0, 'Network error or request failed', errorMessage);
    }
  }

  /**
   * GET request with optional query parameters
   * @param endpoint - API endpoint path
   * @param config - Request configuration
   */
  async get<T = any>(
    endpoint: string,
    config: BaseRequestConfig = {},
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'GET',
    });
  }

  /**
   * POST request with data and optional query parameters
   * @param endpoint - API endpoint path
   * @param config - Request configuration with data
   */
  async post<T = any>(
    endpoint: string,
    config: RequestWithBodyConfig = {},
  ): Promise<T> {
    const { data, ...restConfig } = config;
    return this.request<T>(endpoint, {
      ...restConfig,
      method: 'POST',
      body: data,
    });
  }

  /**
   * PUT request with data and optional query parameters
   * @param endpoint - API endpoint path
   * @param config - Request configuration with data
   */
  async put<T = any>(
    endpoint: string,
    config: RequestWithBodyConfig = {},
  ): Promise<T> {
    const { data, ...restConfig } = config;
    return this.request<T>(endpoint, {
      ...restConfig,
      method: 'PUT',
      body: data,
    });
  }

  /**
   * PATCH request with data and optional query parameters
   * @param endpoint - API endpoint path
   * @param config - Request configuration with data
   */
  async patch<T = any>(
    endpoint: string,
    config: RequestWithBodyConfig = {},
  ): Promise<T> {
    const { data, ...restConfig } = config;
    return this.request<T>(endpoint, {
      ...restConfig,
      method: 'PATCH',
      body: data,
    });
  }

  /**
   * DELETE request with optional query parameters
   * @param endpoint - API endpoint path
   * @param config - Request configuration
   */
  async delete<T = any>(
    endpoint: string,
    config: BaseRequestConfig = {},
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'DELETE',
    });
  }
}

/**
 * API Error class with status code and detailed error information
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public details?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Check if error is a client error (4xx)
   */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /**
   * Check if error is a server error (5xx)
   */
  get isServerError(): boolean {
    return this.status >= 500;
  }

  /**
   * Get formatted error message with status code
   */
  get fullMessage(): string {
    const statusText = this.status ? ` (${this.status})` : '';
    const details = this.details ? `: ${this.details}` : '';
    return `${this.message}${statusText}${details}`;
  }
}

/**
 * Creates API base URL based on environment and execution context
 * @param path - API path to append
 * @returns Complete base URL for API requests
 */
const CREATE_API_BASE_URL = (path: string): string => {
  const defaultUrl = 'http://121.126.210.2/labelstudio';
  const envUrl = process.env.NEXT_PUBLIC_LABELSTUDIO_URL;

  if (typeof window !== 'undefined') {
    // Client-side: use proxy in development, direct URL in production
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      return `/next-api/external${path}`;
    }

    return `${envUrl || defaultUrl}${path}`;
  }

  // Server-side: always use direct URL
  return `${envUrl || defaultUrl}${path}`;
};

/**
 * Pre-configured API client instances
 */
export const APIClient = {
  /** Direct API client for root endpoints */
  direct: new ApiClient(CREATE_API_BASE_URL('/')),
  /** Label Studio API client */
  labelstudio: new ApiClient(CREATE_API_BASE_URL('/api')),
} as const;

/**
 * Options for the useApi React hook
 */
type UseApiOptions<T> = {
  /** Callback fired on successful API call */
  onSuccess?: (data: T) => void;
  /** Callback fired on API error */
  onError?: (error: ApiError) => void;
};

export function useApi<T = any>(
  apiCall: () => Promise<T>,
  options: UseApiOptions<T> = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async (): Promise<T> => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiCall();
      setData(result);
      options.onSuccess?.(result);
      return result;
    } catch (err) {
      const apiError =
        err instanceof ApiError
          ? err
          : new ApiError(
              0,
              'Unknown error',
              err instanceof Error ? err.message : String(err),
            );

      setError(apiError);
      options.onError?.(apiError);
      throw apiError;
    } finally {
      setLoading(false);
    }
  }, [apiCall, options]);

  return {
    /** Response data from the API call */
    data,
    /** Error object if the API call failed */
    error,
    /** Loading state indicator */
    loading,
    /** Function to execute the API call */
    execute,
  } as const;
}

export default APIClient;
