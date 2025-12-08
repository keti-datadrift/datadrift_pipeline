import { getCookie } from '@/utils/cookie.util';
import { useCallback, useState } from 'react';

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
  baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Internal request method with automatic error handling and response parsing
   */
  private async request<T = any>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { url: requestURL, config } = this.buildRequestURL(options, endpoint);

    try {
      const response = await fetch(requestURL, config);

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

  private buildRequestURL(
    options: RequestOptions,
    endpoint: string,
  ): { url: string; config: RequestInit } {
    const { method = 'GET', headers = {}, body, signal, query } = options;

    // Build request headers with automatic content-type detection
    const requestHeaders: Record<string, string> = {
      // Only set default Content-Type if body is not FormData
      ...(body instanceof FormData
        ? {}
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
    return {
      url: requestUrl,
      config: config,
    };
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

  /**
   * Internal SSE stream reader
   */
  private async *streamSSE<T>(
    endpoint: string,
    config: SSEConfig & { data?: any },
    method: 'GET' | 'POST' = 'GET',
  ): AsyncGenerator<SSEEvent<T>, void, unknown> {
    const { parseJson = true, requireEventStream = true } = config;
    const { requestUrl, controller, cleanup } = this.setupSSERequest(
      endpoint,
      config,
    );

    try {
      const requestOptions = this.buildSSERequestOptions(
        config,
        method,
        controller,
      );

      const response = await this.executeSSERequest(
        requestUrl,
        requestOptions,
        method,
      );

      this.validateSSEResponse(response, requireEventStream);
      yield* this.parseSSEStream<T>(response.body!, parseJson);
    } catch (error) {
      this.handleSSEError(error);
    } finally {
      cleanup();
    }
  }

  /**
   * Setup SSE request configuration
   */
  private setupSSERequest(
    endpoint: string,
    config: SSEConfig & { data?: any },
  ) {
    const { signal, query } = config;

    const requestUrl = this.buildSSEUrl(endpoint, query);
    const controller = new AbortController();
    const cleanup = this.createSSECleanup(signal, controller);

    this.setupAbortHandling(signal, controller, cleanup);

    return { requestUrl, controller, cleanup };
  }

  /**
   * Build SSE request URL
   */
  private buildSSEUrl(endpoint: string, query?: Record<string, any>): string {
    const queryString = this.buildQueryString(query);
    const normalizedEndpoint = endpoint.startsWith('/')
      ? endpoint
      : `/${endpoint}`;
    return `${this.baseURL}${normalizedEndpoint}${queryString}`;
  }

  /**
   * Create cleanup function for SSE
   */
  private createSSECleanup(signal?: AbortSignal, controller?: AbortController) {
    return () => {
      if (signal && controller) {
        signal.removeEventListener('abort', () => controller.abort());
      }
    };
  }

  /**
   * Setup abort signal handling
   */
  private setupAbortHandling(
    signal?: AbortSignal,
    controller?: AbortController,
    cleanup?: () => void,
  ): void {
    if (!signal || !controller || !cleanup) return;

    const handleAbort = () => {
      controller.abort();
      cleanup();
    };

    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', handleAbort, { once: true });
    }
  }

  /**
   * Build SSE request options
   */
  private buildSSERequestOptions(
    config: SSEConfig & { data?: any },
    method: 'GET' | 'POST',
    controller: AbortController,
  ): RequestInit {
    const { headers = {}, data } = config;

    const requestOptions: RequestInit = {
      method,
      headers: { 'Cache-Control': 'no-cache', ...headers },
      signal: controller.signal,
      credentials: 'include',
    };

    if (method === 'POST' && data !== undefined) {
      this.addPostDataToRequest(requestOptions, data);
    }

    return requestOptions;
  }

  /**
   * Add POST data to request options
   */
  private addPostDataToRequest(requestOptions: RequestInit, data: any): void {
    if (data instanceof FormData) {
      requestOptions.body = data;
    } else {
      requestOptions.body = JSON.stringify(data);
      requestOptions.headers = {
        ...requestOptions.headers,
        'Content-Type': 'application/json',
      };
    }

    const csrfToken = getCookie('csrftoken');
    if (csrfToken) {
      requestOptions.headers = {
        ...requestOptions.headers,
        'X-CSRFToken': csrfToken,
      };
    }
  }

  /**
   * Execute SSE request and log details
   */
  private async executeSSERequest(
    requestUrl: string,
    requestOptions: RequestInit,
    method: string,
  ): Promise<Response> {
    this.logSSERequest(requestUrl, method, requestOptions);

    const response = await fetch(requestUrl, requestOptions);

    this.logSSEResponse(response);

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response;
  }

  /**
   * Log SSE request details
   */
  private logSSERequest(
    url: string,
    method: string,
    options: RequestInit,
  ): void {
    console.log('🌐 SSE Request:', {
      url,
      method,
      headers: options.headers,
      hasBody: !!options.body,
    });
  }

  /**
   * Log SSE response details
   */
  private logSSEResponse(response: Response): void {
    const headersLog = this.getResponseHeadersLog(response);

    console.log('📥 SSE Response:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      headers: headersLog,
    });
  }

  /**
   * Safely extract response headers for logging
   */
  private getResponseHeadersLog(
    response: Response,
  ): Record<string, string> | undefined {
    try {
      const entries = (response.headers as any)?.entries?.();
      if (entries && typeof entries[Symbol.iterator] === 'function') {
        return Object.fromEntries(entries as Iterable<[string, string]>);
      }
    } catch {
      // Ignore logging headers if not iterable
    }
    return undefined;
  }

  /**
   * Validate SSE response
   */
  private validateSSEResponse(
    response: Response,
    requireEventStream: boolean,
  ): void {
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
  }

  /**
   * Handle SSE-specific errors
   */
  private handleSSEError(error: unknown): never {
    if (error instanceof ApiError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    throw new ApiError(0, 'SSE connection failed', message);
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
    const errorData = await this.extractErrorData(response);

    throw new ApiError(response.status, errorData.message, errorData.details);
  }

  /**
   * Extract error data from response
   */
  private async extractErrorData(response: Response): Promise<{
    message: string;
    details?: string;
    parsedContent: any;
  }> {
    const defaultMessage = `HTTP ${response.status}`;
    const isJson = this.isJsonResponse(response);

    const parsedContent = isJson
      ? await this.safeJsonParse(response)
      : await this.safeTextParse(response);

    return {
      message: this.getErrorMessage(parsedContent) || defaultMessage,
      details: this.getErrorDetails(parsedContent),
      parsedContent,
    };
  }

  /**
   * Check if response is JSON
   */
  private isJsonResponse(response: Response): boolean {
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json');
  }

  /**
   * Safely parse JSON response
   */
  private async safeJsonParse(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Safely parse text response
   */
  private async safeTextParse(response: Response): Promise<string | null> {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }

  /**
   * Get error message from parsed content
   */
  private getErrorMessage(parsedContent: any): string | undefined {
    if (!this.isErrorObject(parsedContent)) return parsedContent;
    return parsedContent.error;
  }

  /**
   * Get error details from parsed content
   */
  private getErrorDetails(parsedContent: any): string | undefined {
    if (!this.isErrorObject(parsedContent)) return undefined;
    return parsedContent.message || parsedContent.details;
  }

  /**
   * Redirect on authentication error
   */
  private redirectOnAuthError(status: number, parsedContent: any): void {
    if (status !== 401) return;

    const redirectTo = this.extractRedirectUrl(parsedContent) || '/login';
    console.log('[API] Authentication required, redirecting to:', redirectTo);
    window.location.href = redirectTo;
  }

  /**
   * Extract redirect URL from parsed content
   */
  private extractRedirectUrl(parsedContent: any): string | null {
    if (!parsedContent || typeof parsedContent !== 'object') return null;
    return parsedContent.redirectTo || null;
  }

  /**
   * Type guard for error objects
   */
  private isErrorObject(obj: any): obj is Record<string, any> & {
    error?: string;
    message?: string;
    details?: string;
  } {
    return obj && typeof obj === 'object';
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
 * Make base URL for API endpoints
 *   - direct, external: http://localhost:9999/labelstudio(/api)/{path}
 *   - internal: http://localhost:9999/next-api/internal/{path}
 *
 * @param path - API endpoint path
 * @param internal - Whether the request is internal to the Next.js app
 */
const makeBaseURL = (path: string): string => {
  return `/next-api/external${path}`;
};

/**
 * Pre-configured API client instances
 */
export const APIClient = {
  /** Direct API client for root endpoints */
  direct: new ApiClient(makeBaseURL('/')),
  /** Label Studio API client */
  external: new ApiClient(makeBaseURL('/api')),
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
