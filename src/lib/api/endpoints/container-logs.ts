import { APIClient, ApiError, SSEEvent } from '../client';

export interface LogMessage {
  container?: string;
  type?: string;
  content: string;
  timestamp: string;
}

export interface LogStreamOptions {
  /** Follow logs in real-time (default: true) */
  follow?: boolean;
  /** Show logs since this Unix timestamp */
  since?: number;
  /** Number of lines to show from end of logs (default: 200) */
  tail?: number | 'all';
}

export const streamContainerLogs = async function* (
  container: string,
  options: LogStreamOptions = {},
): AsyncGenerator<SSEEvent<LogMessage>, void, unknown> {
  try {
    const response = APIClient.external.getStream<LogMessage>(
      '/container/logs',
      {
        query: {
          container,
          follow: options.follow ?? true,
          ...(options.since !== undefined && { since: options.since }),
          ...(options.tail !== undefined && { tail: options.tail }),
        },
      },
    );
    yield* response;
  } catch (error) {
    console.error('Failed to stream container logs:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Failed to stream container logs');
  }
};
