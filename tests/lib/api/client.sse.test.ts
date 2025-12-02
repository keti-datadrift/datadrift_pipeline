/**
 * @jest-environment jsdom
 */

import { ApiClient, ApiError } from '../../../src/lib/api/client';

// Ensure TextEncoder/TextDecoder are available in the test environment
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Mock fetch for testing
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock getCookie utility
jest.mock('../../../src/lib/utils/cookie.util', () => ({
  getCookie: jest.fn().mockReturnValue('mock-csrf-token'),
}));

describe('ApiClient SSE Functionality', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('https://test-api.com');
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStream', () => {
    it('should make GET request with correct SSE headers', async () => {
      const mockResponse = createMockSSEResponse([
        'data: {"message": "test"}\n\n',
      ]);
      mockFetch.mockResolvedValue(mockResponse);

      const stream = client.getStream('/test-endpoint', {
        query: { param: 'value' },
        headers: { 'Custom-Header': 'test' },
      });

      // Get first event to trigger the fetch
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.com/test-endpoint?param=value',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Custom-Header': 'test',
          }),
          credentials: 'include',
        }),
      );
    });

    it('should parse SSE events correctly', async () => {
      const mockResponse = createMockSSEResponse([
        'event: test-event\n',
        'id: 123\n',
        'data: {"message": "hello"}\n\n',
        'data: {"message": "world"}\n\n',
      ]);
      mockFetch.mockResolvedValue(mockResponse);

      const stream = client.getStream<{ message: string }>('/test');
      const events = [];

      const iterator = stream[Symbol.asyncIterator]();

      // Get first event
      const result1 = await iterator.next();
      if (!result1.done) events.push(result1.value);

      // Get second event
      const result2 = await iterator.next();
      if (!result2.done) events.push(result2.value);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        data: { message: 'hello' },
        event: 'test-event',
        id: '123',
      });
      expect(events[1]).toEqual({
        data: { message: 'world' },
        event: undefined,
        id: undefined,
      });
    });

    it('should handle multi-line data correctly', async () => {
      const mockResponse = createMockSSEResponse([
        'data: line 1\n',
        'data: line 2\n',
        'data: line 3\n\n',
      ]);
      mockFetch.mockResolvedValue(mockResponse);

      const stream = client.getStream('/test', { parseJson: false });
      const iterator = stream[Symbol.asyncIterator]();
      const result = await iterator.next();

      expect(result.value?.data).toBe('line 1\nline 2\nline 3');
    });

    it('should handle JSON parsing with fallback to raw string', async () => {
      const mockResponse = createMockSSEResponse([
        'data: {"valid": "json"}\n\n',
        'data: invalid json\n\n',
      ]);
      mockFetch.mockResolvedValue(mockResponse);

      const stream = client.getStream('/test', { parseJson: true });
      const events = [];

      const iterator = stream[Symbol.asyncIterator]();

      const result1 = await iterator.next();
      if (!result1.done) events.push(result1.value);

      const result2 = await iterator.next();
      if (!result2.done) events.push(result2.value);

      expect(events[0]?.data).toEqual({ valid: 'json' });
      expect(events[1]?.data).toBe('invalid json');
    });

    it('should skip comments and empty lines', async () => {
      const mockResponse = createMockSSEResponse([
        ': this is a comment\n',
        '\n',
        'data: actual data\n\n',
      ]);
      mockFetch.mockResolvedValue(mockResponse);

      const stream = client.getStream('/test');
      const iterator = stream[Symbol.asyncIterator]();
      const result = await iterator.next();

      expect(result.value?.data).toBe('actual data');
    });

    it('should handle abort signal correctly', async () => {
      const controller = new AbortController();
      const mockResponse = createMockSSEResponse(['data: test\n\n'], {
        signal: controller.signal,
      });
      mockFetch.mockResolvedValue(mockResponse);

      const stream = client.getStream('/test', {
        signal: controller.signal,
      });

      // Abort immediately
      controller.abort();

      const iterator = stream[Symbol.asyncIterator]();

      await expect(iterator.next()).rejects.toThrow();
    });

    it('should throw ApiError for HTTP errors', async () => {
      const mockResponse = createMockSSEResponse([], {
        status: 404,
        contentType: 'application/json',
      });
      mockFetch.mockResolvedValue(mockResponse);

      const stream = client.getStream('/nonexistent');
      const iterator = stream[Symbol.asyncIterator]();

      await expect(iterator.next()).rejects.toThrow(ApiError);
    });

    it('should validate content-type when requireEventStream is true', async () => {
      const mockResponse = createMockSSEResponse(['data: test\n\n'], {
        contentType: 'text/plain',
      });
      mockFetch.mockResolvedValue(mockResponse);

      const stream = client.getStream('/test', { requireEventStream: true });
      const iterator = stream[Symbol.asyncIterator]();

      await expect(iterator.next()).rejects.toThrow(ApiError);
    });
  });

  describe('postStream', () => {
    it('should make POST request with body and CSRF token', async () => {
      const mockResponse = createMockSSEResponse([
        'data: {"result": "success"}\n\n',
      ]);
      mockFetch.mockResolvedValue(mockResponse);

      const testData = { query: 'test search', filters: ['a', 'b'] };
      const stream = client.postStream('/search', {
        data: testData,
        headers: { 'Custom-Header': 'test' },
      });

      // Trigger the fetch
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.com/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
            'X-CSRFToken': 'mock-csrf-token',
            'Custom-Header': 'test',
          }),
          body: JSON.stringify(testData),
          credentials: 'include',
        }),
      );
    });

    it('should handle FormData correctly', async () => {
      const mockResponse = createMockSSEResponse(['data: success\n\n']);
      mockFetch.mockResolvedValue(mockResponse);

      const formData = new FormData();
      formData.append('file', 'test-content');

      const stream = client.postStream('/upload', { data: formData });
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();

      const call = mockFetch.mock.calls[0][1];
      expect(call.body).toBe(formData);
      expect(call.headers['Content-Type']).toBeUndefined(); // Let browser set it
    });
  });

  describe('Error handling', () => {
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const stream = client.getStream('/test');
      const iterator = stream[Symbol.asyncIterator]();

      await expect(iterator.next()).rejects.toThrow(ApiError);
    });

    it('should handle missing response body', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockImplementation((name: string) => {
            if (name.toLowerCase() === 'content-type') {
              return 'text/event-stream';
            }
            return null;
          }),
        },
        body: null,
      };
      mockFetch.mockResolvedValue(mockResponse);

      const stream = client.getStream('/test');
      const iterator = stream[Symbol.asyncIterator]();

      await expect(iterator.next()).rejects.toThrow(ApiError);
    });
  });
});

// Helper functions for creating mock responses
function createMockSSEResponse(
  chunks: string[],
  options: { signal?: AbortSignal; status?: number; contentType?: string } = {},
) {
  const status = options.status ?? 200;
  const contentType = options.contentType ?? 'text/event-stream';

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: jest.fn().mockImplementation((name: string) => {
        if (name.toLowerCase() === 'content-type') {
          return contentType;
        }
        return null;
      }),
    },
    body: createMockReadableStream(chunks, options),
    json: jest.fn().mockResolvedValue({ error: 'Not Found' }),
    text: jest.fn().mockResolvedValue('Error message'),
  };
}

function createMockReadableStream(
  chunks: string[],
  options: { signal?: AbortSignal } = {},
) {
  let index = 0;
  let released = false;

  return {
    getReader: () => ({
      read: jest.fn().mockImplementation(async () => {
        // Check if aborted
        if (options.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        // Check if reader was released
        if (released) {
          throw new TypeError('Reader is released');
        }

        if (index >= chunks.length) {
          return { done: true, value: undefined };
        }

        const chunk = chunks[index++];
        const encoder = new TextEncoder();
        return { done: false, value: encoder.encode(chunk) };
      }),
      releaseLock: jest.fn().mockImplementation(() => {
        released = true;
      }),
      cancel: jest.fn(),
      closed: Promise.resolve(),
    }),
  };
}
