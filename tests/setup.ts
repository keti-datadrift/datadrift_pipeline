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
  try {
    // Prefer Node's native implementation when available
    const { MessagePort } = require('worker_threads');
    (global as any).MessagePort = MessagePort;
  } catch {
    // Minimal polyfill satisfying TS lib.dom MessagePort shape
    class PolyfillMessagePort {
      onmessage: ((event: any) => void) | null = null;
      onmessageerror: ((event: any) => void) | null = null;

      addEventListener(_type: string, _listener: any) {}
      removeEventListener(_type: string, _listener: any) {}
      dispatchEvent(_event: any): boolean {
        return false;
      }

      start() {}
      close() {}
      postMessage(_message?: any, _transfer?: any) {}
    }

    (global as any).MessagePort = PolyfillMessagePort as unknown as {
      new (): MessagePort;
      prototype: MessagePort;
    };
  }
}

// Add fetch polyfill for Node.js environment
// This will be overridden by Jest mocks in unit tests, but needed for integration tests
if (typeof fetch === 'undefined') {
  const {
    fetch,
    Headers,
    Request,
    Response,
    FormData,
    File,
    Blob,
  } = require('undici');
  global.fetch = fetch;
  global.Headers = Headers;
  global.Request = Request;
  global.Response = Response;
  if (typeof global.FormData === 'undefined') {
    global.FormData = FormData;
  }
  if (typeof global.File === 'undefined') {
    (global as any).File = File;
  }
  if (typeof global.Blob === 'undefined') {
    (global as any).Blob = Blob;
  }
}

// Mock DOMException for abort errors
if (typeof DOMException === 'undefined') {
  class PolyfillDOMException extends Error {
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name ?? 'DOMException';
    }
  }

  // Cast to any to satisfy the lib.dom constructor interface (which includes legacy static constants)
  (globalThis as any).DOMException = PolyfillDOMException as any;
}

// Mock AbortController if not available
if (typeof AbortController === 'undefined') {
  const { AbortController } = require('abort-controller');
  global.AbortController = AbortController;
}

// Ensure FormData exists even if fetch already exists from another polyfill
if (typeof FormData === 'undefined') {
  try {
    const { FormData, File, Blob } = require('undici');
    global.FormData = FormData;
    if (typeof (global as any).File === 'undefined')
      (global as any).File = File;
    if (typeof (global as any).Blob === 'undefined')
      (global as any).Blob = Blob;
  } catch {
    // If undici is unavailable, leave as undefined; tests that require FormData should mock it.
  }
}

// Increase timeout for integration tests
jest.setTimeout(30000);
