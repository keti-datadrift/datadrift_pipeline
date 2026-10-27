import {
  LogMessage,
  LogStreamOptions,
  streamContainerLogs,
} from '@/lib/api/endpoints';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Custom hook for streaming container logs using Server-Sent Events
 */
export function useContainerLogs(options: LogStreamOptions = {}): {
  data: LogMessage[];
  isLoading: boolean;
  error: string | null;
  stopStreaming: () => void;
  refetch: (container: string) => Promise<void>;
  reset: () => void;
} {
  const [data, setData] = useState<LogMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const startStreaming = useCallback(
    async (container: string) => {
      if (isLoading) return;

      setError(null);

      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      try {
        console.log(
          '=▶︎ Starting container logs stream with options:',
          options,
        );
        const generator = streamContainerLogs(container, options);

        let eventCount = 0;
        for await (const event of generator) {
          eventCount++;
          console.log(`=▶︎ Log SSE Event #${eventCount}:`, {
            data: event.data,
            type: typeof event.data,
            event: event.event,
            id: event.id,
            timestamp: new Date().toISOString(),
          });

          // Check if request was aborted
          if (abortControllerRef.current?.signal.aborted) {
            console.log('L Container logs stream aborted');
            break;
          }

          try {
            // Handle the SSE event data - it might already be an object or a JSON string
            let logData: LogMessage;

            if (typeof event.data === 'string') {
              // If it's a string, parse it as JSON
              logData = JSON.parse(event.data) as LogMessage;
            } else if (typeof event.data === 'object' && event.data !== null) {
              // If it's already an object, use it directly
              logData = {
                timestamp: event.data.timestamp,
                container: event.data.container || '',
                content: event.data.content || '',
                type: event.data.type,
              };
            } else {
              console.warn(
                'Unexpected log event data type:',
                typeof event.data,
                event.data,
              );
              continue;
            }

            if (logData.type == 'heartbeat') {
              continue;
            }

            // Append new log message to existing data
            setData((prevData) => [...prevData, logData]);
          } catch (parseError) {
            console.warn('Failed to parse log message data:', parseError);
            console.warn('Event data was:', event.data);
            // Continue processing other events even if one fails to parse
          }
        }
      } catch (err) {
        if (!abortControllerRef.current?.signal.aborted) {
          const errorMessage =
            err instanceof Error
              ? err.message
              : 'Failed to stream container logs';
          setError(errorMessage);
        }
      } finally {
        if (!abortControllerRef.current?.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [options, isLoading],
  );

  const refetch = useCallback(
    async (container: string) => {
      // Clear current data for new stream
      setData([]);
      setIsLoading(true);
      await startStreaming(`package-${container}-1`);
    },
    [startStreaming],
  );

  const reset = useCallback(() => {
    setData([]);
    setError(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
  }, []);

  return {
    data,
    isLoading,
    error,
    stopStreaming,
    refetch,
    reset,
  };
}
