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

/** SSE-specific configuration */
interface SSEConfig extends BaseRequestConfig {
  /** If true (default), will attempt JSON.parse on SSE data payloads */
  parseJson?: boolean;
  /** Optional expected content-type check; if true (default), requires text/event-stream */
  requireEventStream?: boolean;
}

/** SSE event structure */
export interface SSEEvent<T = any> {
  data: T;
  event?: string;
  id?: string;
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
   * Internal SSE stream reader
   */
  private async *streamSSE<T>(
    endpoint: string,
    config: SSEConfig & { data?: any },
    method: 'GET' | 'POST' = 'GET',
  ): AsyncGenerator<SSEEvent<T>, void, unknown> {
    const {
      headers = {},
      signal,
      query,
      parseJson = true,
      requireEventStream = true,
      data,
    } = config;

    const queryString = this.buildQueryString(query);
    const normalizedEndpoint = endpoint.startsWith('/')
      ? endpoint
      : `/${endpoint}`;
    const requestUrl = `${this.baseURL}${normalizedEndpoint}${queryString}`;

    const controller = new AbortController();
    const cleanup = () => {
      if (signal) signal.removeEventListener('abort', handleAbort);
    };
    const handleAbort = () => {
      controller.abort();
      cleanup();
    };

    if (signal?.aborted) {
      controller.abort();
    } else if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    try {
      const requestOptions: RequestInit = {
        method,
        headers: {
          'Cache-Control': 'no-cache',
          ...headers,
        },
        signal: controller.signal,
        credentials: 'include',
      };

      if (method === 'POST' && data !== undefined) {
        if (data instanceof FormData) {
          requestOptions.body = data;
          // Don't set Content-Type, let browser set it for FormData with boundary
        } else {
          requestOptions.body = JSON.stringify(data);
          requestOptions.headers = {
            ...requestOptions.headers,
            'Content-Type': 'application/json',
          };
        }

        // Add CSRF token for POST requests
        const csrfToken = getCookie('csrftoken');
        if (csrfToken) {
          requestOptions.headers = {
            ...requestOptions.headers,
            'X-CSRFToken': csrfToken,
          };
        }
      }

      console.log('🌐 SSE Request:', {
        url: requestUrl,
        method,
        headers: requestOptions.headers,
        hasBody: !!requestOptions.body,
      });

      const response = await fetch(requestUrl, requestOptions);

      // Create a safe headers log: mocks may not implement headers.entries()
      let headersLog: Record<string, string> | undefined;
      try {
        const entries = (response.headers as any)?.entries?.();
        if (entries && typeof entries[Symbol.iterator] === 'function') {
          headersLog = Object.fromEntries(
            entries as Iterable<[string, string]>,
          );
        }
      } catch {
        // Ignore logging headers if not iterable
      }

      console.log('📥 SSE Response:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        headers: headersLog,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const contentType = response.headers.get('content-type') || '';
      if (requireEventStream && !contentType.includes('text/event-stream')) {
        throw new ApiError(
          0,
          'Invalid SSE response',
          `Expected text/event-stream, got ${contentType || 'unknown'}`,
        );
      }

      if (!response.body) {
        throw new ApiError(0, 'Stream error', 'Missing response body for SSE');
      }

      yield* this.parseSSEStream<T>(response.body, parseJson);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ApiError(0, 'SSE connection failed', message);
    } finally {
      cleanup();
    }
  }

  /**
   * Parse SSE stream from ReadableStream
   */
  private async *parseSSEStream<T>(
    body: ReadableStream<Uint8Array>,
    parseJson: boolean,
  ): AsyncGenerator<SSEEvent<T>, void, unknown> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let chunkCount = 0;
    let eventCount = 0;

    console.log('🔄 Starting SSE stream parsing...');

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          console.log(
            '✅ SSE stream completed after',
            chunkCount,
            'chunks and',
            eventCount,
            'events',
          );
          break;
        }

        chunkCount++;
        const chunk = decoder.decode(value, { stream: true });
        console.log(
          `📦 Chunk #${chunkCount} (${chunk.length} chars):`,
          JSON.stringify(chunk.substring(0, 100)),
        );

        buffer += chunk;

        // Process complete events (separated by double newlines)
        let eventEnd = buffer.indexOf('\n\n');
        while (eventEnd !== -1) {
          const rawEvent = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);

          console.log(
            `🎯 Raw SSE event #${eventCount + 1}:`,
            JSON.stringify(rawEvent),
          );

          const event = this.parseSSEEvent<T>(rawEvent, parseJson);
          if (event) {
            eventCount++;
            console.log(`✨ Parsed SSE event #${eventCount}:`, event);
            yield event;
          }

          eventEnd = buffer.indexOf('\n\n');
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parse individual SSE event
   */
  private parseSSEEvent<T>(
    rawEvent: string,
    parseJson: boolean,
  ): SSEEvent<T> | null {
    const lines = rawEvent.split(/\r?\n/);
    const dataLines: string[] = [];
    let event: string | undefined;
    let id: string | undefined;

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue; // Skip comments and empty lines

      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      } else if (line.startsWith('event:')) {
        event = line.slice(6).trimStart();
      } else if (line.startsWith('id:')) {
        id = line.slice(3).trimStart();
      }
      // Ignore retry and other fields
    }

    if (dataLines.length === 0) return null;

    const dataStr = dataLines.join('\n');
    let data: unknown = dataStr;

    if (parseJson && dataStr) {
      try {
        data = JSON.parse(dataStr);
      } catch {
        // Keep raw string if JSON parsing fails
      }
    }

    return { data: data as T, event, id };
  }

  /**
   * Handle error responses consistently
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let message = `HTTP ${response.status}`;
    let details: string | undefined;
    const contentType = response.headers.get('content-type') || '';

    try {
      if (contentType.includes('application/json')) {
        const parsed: unknown = await response.json();
        if (this.isErrorObject(parsed)) {
          message = parsed.error || message;
          details = parsed.message || parsed.details;

          // Handle special authentication error that requires redirect
          if (
            parsed.error === 'AUTHENTICATION_REQUIRED' &&
            typeof window !== 'undefined'
          ) {
            const redirectTo = (parsed as any).redirectTo || '/login';
            console.log(
              '[API] Authentication required, redirecting to:',
              redirectTo,
            );
            window.location.href = redirectTo;
            // Still throw the error after initiating redirect
          }
        }
      } else {
        const text = await response.text();
        if (text) message = text;
      }
    } catch {
      // Use defaults if parsing fails
    }

    throw new ApiError(response.status, message, details);
  }

  /**
   * Type guard for error objects
   */
  private isErrorObject(obj: unknown): obj is Record<string, unknown> & {
    error?: string;
    message?: string;
    details?: string;
  } {
    return typeof obj === 'object' && obj !== null;
  }

  /**
   * Builds query string from object parameters
   * Handles arrays, null/undefined values, and proper URL encoding
   */
  private buildQueryString(query?: Record<string, unknown>): string {
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
        await this.handleErrorResponse(response);
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
      return (await response.text()) as unknown as T;
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
   * GET request
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
   * GET request with Server-Sent Events streaming
   * @param endpoint - API endpoint path
   * @param config - SSE configuration
   */
  getStream<T = any>(
    endpoint: string,
    config: SSEConfig = {},
  ): AsyncGenerator<SSEEvent<T>, void, unknown> {
    return this.streamSSE<T>(endpoint, config);
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
   * POST request with Server-Sent Events streaming
   * @param endpoint - API endpoint path
   * @param config - SSE configuration with optional data
   */
  postStream<T = any>(
    endpoint: string,
    config: SSEConfig & { data?: any } = {},
  ): AsyncGenerator<SSEEvent<T>, void, unknown> {
    // Note: POST SSE is uncommon but supported
    return this.streamSSE<T>(endpoint, config, 'POST');
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
