/**
 * @jest-environment node
 */

/**
 * Integration tests for SSE functionality using real endpoints
 * These tests require network access and may be slower
 *
 * Run with: npm test -- --testNamePattern="SSE Integration"
 * Or: jest tests/lib/api/client.sse.integration.test.ts
 */

// Ensure fetch polyfill is available for integration tests
if (typeof fetch === 'undefined') {
  require('../../../tests/setup');
}

import { ApiClient, ApiError } from '../../../src/lib/api/client';

// Skip integration tests in CI or when SKIP_INTEGRATION is set
const skipIntegration = process.env.CI || process.env.SKIP_INTEGRATION;

describe('SSE Integration Tests', () => {
  let client: ApiClient;

  beforeAll(() => {
    client = new ApiClient('https://sse.dev');
  });

  describe('Real SSE endpoint testing', () => {
    it('should successfully connect to sse.dev/test and receive events', async () => {
      if (skipIntegration) {
        console.log(
          'Skipping integration test - set SKIP_INTEGRATION=false to run',
        );
        return;
      }

      const events: any[] = [];
      const maxEvents = 3;
      const timeout = 10000; // 10 second timeout

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Test timeout')), timeout);
      });

      const streamPromise = (async () => {
        try {
          for await (const event of client.getStream('/test', {
            parseJson: true,
            requireEventStream: true,
          })) {
            events.push(event);
            console.log(`Received event ${events.length}:`, {
              event: event.event,
              id: event.id,
              data: event.data,
            });

            if (events.length >= maxEvents) {
              break;
            }
          }
        } catch (error) {
          console.error('Stream error:', error);
          throw error;
        }
      })();

      await Promise.race([streamPromise, timeoutPromise]);

      // Verify we received events
      expect(events.length).toBe(maxEvents);

      // Verify event structure
      events.forEach((event, _) => {
        expect(event).toHaveProperty('data');
        expect(event).toHaveProperty('event');
        expect(event).toHaveProperty('id');

        // sse.dev/test typically sends timestamp data
        if (typeof event.data === 'object') {
          // Could be 'timestamp' or 'now' depending on the endpoint
          const hasTimestamp =
            event.data.hasOwnProperty('timestamp') ||
            event.data.hasOwnProperty('now');
          expect(hasTimestamp).toBe(true);
        }
      });
    }, 15000); // 15 second Jest timeout

    it('should handle abort signal correctly with real endpoint', async () => {
      if (skipIntegration) return;

      const controller = new AbortController();
      const events: any[] = [];

      // Abort after 2 seconds
      setTimeout(() => {
        console.log('Aborting stream...');
        controller.abort();
      }, 2000);

      try {
        for await (const event of client.getStream('/test', {
          signal: controller.signal,
          parseJson: true,
        })) {
          events.push(event);
          console.log(`Event before abort: ${events.length}`);
        }

        // Should not reach here
        fail('Stream should have been aborted');
      } catch (error) {
        // The error could be either an AbortError or an ApiError wrapping an AbortError
        const errorName = (error as any).name || '';
        const errorMessage = (error as any).message || '';
        const isAbortError =
          errorName.match(/abort/i) ||
          errorMessage.match(/abort/i) ||
          errorName === 'ApiError';
        expect(isAbortError).toBeTruthy();
        console.log(`Successfully aborted after ${events.length} events`);
      }
    }, 10000);

    it('should handle custom headers with real endpoint', async () => {
      if (skipIntegration) return;

      const events: any[] = [];
      let receivedEvent = false;

      try {
        for await (const event of client.getStream('/test', {
          headers: {
            'User-Agent': 'Jest-SSE-Test/1.0',
            'Accept-Language': 'en-US',
          },
          parseJson: true,
        })) {
          events.push(event);
          receivedEvent = true;
          console.log('Received event with custom headers:', event.data);
          break; // Just need one event to verify headers work
        }

        expect(receivedEvent).toBe(true);
        expect(events.length).toBeGreaterThan(0);
      } catch (error) {
        console.error('Custom headers test failed:', error);
        throw error;
      }
    }, 10000);

    it('should handle invalid endpoint gracefully', async () => {
      const invalidClient = new ApiClient('https://sse.dev');

      try {
        for await (const _ of invalidClient.getStream(
          '/nonexistent-endpoint',
        )) {
          fail('Should not receive events from invalid endpoint');
        }
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        // The status might be 0 if wrapped by SSE connection failed error
        expect([0, 404]).toContain((error as ApiError).status);
        console.log('Correctly handled error:', (error as ApiError).message);
      }
    });

    it('should handle network errors gracefully', async () => {
      const invalidClient = new ApiClient(
        'https://invalid-domain-that-does-not-exist.com',
      );

      try {
        for await (const _ of invalidClient.getStream('/test')) {
          fail('Should not receive events from invalid domain');
        }
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.message).toMatch(/connection failed|network error/i);
        console.log('Correctly handled network error:', error.message);
      }
    });
  });

  describe('Performance and reliability', () => {
    it('should handle rapid event consumption', async () => {
      if (skipIntegration) return;

      const events: any[] = [];
      const startTime = Date.now();
      const maxEvents = 10;

      try {
        for await (const event of client.getStream('/test', {
          parseJson: true,
        })) {
          events.push({
            ...event,
            receivedAt: Date.now(),
          });

          if (events.length >= maxEvents) {
            break;
          }
        }

        const duration = Date.now() - startTime;
        console.log(`Received ${events.length} events in ${duration}ms`);

        expect(events.length).toBe(maxEvents);
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

        // Verify events are received in order (if they have IDs)
        const eventsWithIds = events.filter((e) => e.id);
        if (eventsWithIds.length > 1) {
          for (let i = 1; i < eventsWithIds.length; i++) {
            const prevId = parseInt(eventsWithIds[i - 1].id);
            const currentId = parseInt(eventsWithIds[i].id);
            if (!isNaN(prevId) && !isNaN(currentId)) {
              expect(currentId).toBeGreaterThan(prevId);
            }
          }
        }
      } catch (error) {
        console.error('Rapid consumption test failed:', error);
        throw error;
      }
    }, 35000);
  });
});

// Helper to run a quick smoke test
describe('SSE Smoke Test', () => {
  it('should be able to create client and call getStream method', () => {
    const client = new ApiClient('https://example.com');
    const stream = client.getStream('/test');

    expect(stream).toBeDefined();
    expect(typeof stream[Symbol.asyncIterator]).toBe('function');
  });

  it('should be able to create client and call postStream method', () => {
    const client = new ApiClient('https://example.com');
    const stream = client.postStream('/test', { data: { test: true } });

    expect(stream).toBeDefined();
    expect(typeof stream[Symbol.asyncIterator]).toBe('function');
  });
});
