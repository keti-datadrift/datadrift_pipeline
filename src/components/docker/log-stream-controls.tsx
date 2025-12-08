'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Play, Square, Trash2 } from 'lucide-react';

interface LogStreamControlsProps {
  selectedContainer: string;
  tailLines: string;
  onTailLinesChange: (value: string) => void;
  isStreaming: boolean;
  onStartStreaming: () => void;
  onStopStreaming: () => void;
  onClearLogs: () => void;
  loading?: boolean;
  /** Disable state for entire component */
  disabled?: boolean;
}

export function LogStreamControls({
  selectedContainer,
  tailLines,
  onTailLinesChange,
  isStreaming,
  onStartStreaming,
  onStopStreaming,
  onClearLogs,
  disabled = false,
  loading = false,
}: LogStreamControlsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="tail">Tail Lines</Label>
        <Select
          value={tailLines}
          onValueChange={onTailLinesChange}
          disabled={disabled || isStreaming}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50 lines</SelectItem>
            <SelectItem value="100">100 lines</SelectItem>
            <SelectItem value="200">200 lines</SelectItem>
            <SelectItem value="500">500 lines</SelectItem>
            <SelectItem value="1000">1000 lines</SelectItem>
            <SelectItem value="all">All lines</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Controls</Label>
        <div className="flex gap-2">
          {!isStreaming ? (
            <Button
              onClick={onStartStreaming}
              disabled={!selectedContainer.trim() || loading || disabled}
              size="sm"
              className="hover:cursor-pointer"
            >
              <Play className="h-4 w-4 mr-1" />
              Start
            </Button>
          ) : (
            <Button
              onClick={onStopStreaming}
              variant="outline"
              size="sm"
              disabled={disabled}
              className="hover:cursor-pointer"
            >
              <Square className="h-4 w-4 mr-1" />
              Stop
            </Button>
          )}
          <Button
            onClick={onClearLogs}
            variant="outline"
            size="sm"
            disabled={disabled}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>
    </>
  );
}
