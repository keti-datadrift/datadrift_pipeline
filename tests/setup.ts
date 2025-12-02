/**
 * Jest setup file for SSE tests
 */

// Mock TextEncoder/TextDecoder for Node.js environment first
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Mock ReadableStream and MessagePort for undici compatibility
if (typeof ReadableStream === 'undefined') {
  global.ReadableStream = require('stream/web').ReadableStream;
}

if (typeof MessagePort === 'undefined') {
  global.MessagePort = class MessagePort {
    start() {}
    close() {}
    postMessage() {}
  };
}

// Add fetch polyfill for Node.js environment
// This will be overridden by Jest mocks in unit tests, but needed for integration tests
if (typeof fetch === 'undefined') {
  const { fetch, Headers, Request, Response } = require('undici');
  global.fetch = fetch;
  global.Headers = Headers;
  global.Request = Request;
  global.Response = Response;
}

// Mock DOMException for abort errors
if (typeof DOMException === 'undefined') {
  global.DOMException = class DOMException extends Error {
    constructor(message: string, name: string) {
      super(message);
      this.name = name;
    }
  };
}

// Mock AbortController if not available
if (typeof AbortController === 'undefined') {
  const { AbortController } = require('abort-controller');
  global.AbortController = AbortController;
}

// Mock FormData if not available
if (typeof FormData === 'undefined') {
  global.FormData = class FormData {
    private data = new Map<string, any>();

    append(key: string, value: any) {
      this.data.set(key, value);
    }

    get(key: string) {
      return this.data.get(key);
    }
  };
}

// Increase timeout for integration tests
jest.setTimeout(30000);
