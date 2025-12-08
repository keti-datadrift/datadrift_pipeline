'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Terminal } from 'lucide-react';
import { ContainerSelector } from './container-selector';
import { LogStreamControls } from './log-stream-controls';

interface LogStreamConfigurationProps {
  selectedContainer: string;
  onSelectedContainerChange: (value: string) => void;
  tailLines: string;
  onTailLinesChange: (value: string) => void;
  isStreaming: boolean;
  onStartStreaming: () => void;
  onStopStreaming: () => void;
  onClearLogs: () => void;
  loading?: boolean;
  error: string | null;
}

export function LogStreamConfiguration({
  selectedContainer,
  onSelectedContainerChange,
  tailLines,
  onTailLinesChange,
  isStreaming,
  onStartStreaming,
  onStopStreaming,
  onClearLogs,
  loading = false,
  error,
}: LogStreamConfigurationProps) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          Log Stream Configuration
        </CardTitle>
        <CardDescription>
          Configure container selection and streaming options
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ContainerSelector
            value={selectedContainer}
            onValueChange={onSelectedContainerChange}
            disabled={isStreaming}
            placeholder="Select container"
          />

          <LogStreamControls
            selectedContainer={selectedContainer}
            tailLines={tailLines}
            onTailLinesChange={onTailLinesChange}
            isStreaming={isStreaming}
            onStartStreaming={onStartStreaming}
            onStopStreaming={onStopStreaming}
            onClearLogs={onClearLogs}
            loading={loading}
            disabled={false}
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
            Error: {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
