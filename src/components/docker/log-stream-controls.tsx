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
import { useI18n } from '@/contexts/I18nContext';

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
  const { t } = useI18n();
  const tailLineOptions = [50, 100, 200, 500, 1000];
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="tail">{t('monitoring.logs.tailLines.label')}</Label>
        <Select
          value={tailLines}
          onValueChange={onTailLinesChange}
          disabled={disabled || isStreaming}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tailLineOptions.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {t('monitoring.logs.tailLines.count', { count: n })}
              </SelectItem>
            ))}
            <SelectItem value="all">{t('monitoring.logs.tailLines.all')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{t('monitoring.logs.controls.label')}</Label>
        <div className="flex gap-2">
          {!isStreaming ? (
            <Button
              onClick={onStartStreaming}
              disabled={!selectedContainer.trim() || loading || disabled}
              size="sm"
              className="hover:cursor-pointer"
            >
              <Play className="h-4 w-4 mr-1" />
              {t('monitoring.logs.controls.start')}
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
              {t('monitoring.logs.controls.stop')}
            </Button>
          )}
          <Button
            onClick={onClearLogs}
            variant="outline"
            size="sm"
            disabled={disabled}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            {t('monitoring.logs.controls.clear')}
          </Button>
        </div>
      </div>
    </>
  );
}
