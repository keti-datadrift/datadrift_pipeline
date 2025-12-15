'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { LogMessage } from '@/lib/api/endpoints';
import {
  Activity,
  ArrowDownFromLine,
  Download,
  ScrollText,
  Terminal,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useI18n } from '@/contexts/I18nContext';

interface LogViewerProps {
  logs: LogMessage[];
  isStreaming: boolean;
  selectedContainer: string;
  autoScroll: boolean;
  onAutoScrollChange: (autoScroll: boolean) => void;
  onDownloadLogs: () => void;
}

export function LogViewer({
  logs,
  isStreaming,
  selectedContainer,
  autoScroll,
  onAutoScrollChange,
  onDownloadLogs,
}: LogViewerProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (autoScroll && logContainerRef.current && logs.length > 0) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            <CardTitle>
              {t('monitoring.logs.viewer.title')}
              {selectedContainer && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({selectedContainer})
                </span>
              )}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity
                className={`h-4 w-4 ${isStreaming ? 'text-green-500' : 'text-gray-400'}`}
              />
              {isStreaming
                ? t('monitoring.logs.viewer.status.streaming')
                : t('monitoring.logs.viewer.status.stopped')}
              {logs.length > 0 && (
                <span className="ml-2">
                  {t('monitoring.logs.viewer.messages', { count: logs.length })}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAutoScrollChange(!autoScroll)}
                className={autoScroll ? 'bg-blue-50' : ''}
              >
                <ArrowDownFromLine
                  className={`h-4 w-4 ${autoScroll ? 'text-blue-600' : ''}`}
                />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDownloadLogs}
                disabled={logs.length === 0}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <CardDescription>
          {!isStreaming && !selectedContainer
            ? t('monitoring.logs.viewer.hint.enterContainer')
            : isStreaming
              ? t('monitoring.logs.viewer.hint.active')
              : t('monitoring.logs.viewer.hint.stopped')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div
          ref={logContainerRef}
          className="flex-1 w-full overflow-y-auto overflow-x-hidden bg-black text-green-400 p-4 rounded-md font-mono text-sm"
          style={{ fontFamily: 'Monaco, Consolas, "Courier New", monospace' }}
        >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              {isStreaming ? (
                <div className="text-center">
                  <Activity className="h-8 w-8 mx-auto mb-2 animate-pulse" />
                  <p>{t('monitoring.logs.viewer.empty.waiting')}</p>
                </div>
              ) : (
                <div className="text-center">
                  <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{t('monitoring.logs.viewer.empty.none')}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => {
                return (
                  <div key={index} className={`leading-relaxed`}>
                    {log.container && (
                      <span className="text-yellow-400">[{log.container}]</span>
                    )}{' '}
                    <span>{log.content}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
