'use client';

import { LogStreamConfiguration, LogViewer } from '@/components/docker';
import { useContainerLogs } from '@/hooks/network/docker';
import { LogStreamOptions } from '@/lib/api/endpoints';
import { useCallback, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';

export default function LogsMonitoringPage() {
  const { t } = useI18n();
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [tailLines, setTailLines] = useState<string>('all');
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const logOptions: LogStreamOptions = {
    follow: true,
    tail: tailLines === 'all' ? 'all' : parseInt(tailLines) || 200,
  };

  const {
    data: logs,
    isLoading,
    error,
    stopStreaming,
    refetch,
    reset,
  } = useContainerLogs(logOptions);

  const handleStartStreaming = useCallback(async () => {
    if (!selectedContainer.trim()) return;
    setIsStreaming(true);
    await refetch(selectedContainer);
  }, [selectedContainer, refetch]);

  const handleStopStreaming = useCallback(() => {
    stopStreaming();
    setIsStreaming(false);
  }, [stopStreaming]);

  const handleClearLogs = useCallback(() => {
    reset();
  }, [reset]);

  const handleDownloadLogs = useCallback(() => {
    if (logs.length === 0) return;

    const logText = logs
      .map((log) => {
        const container = log.container ? `[${log.container}] ` : '';
        const stream = log.type ? `[${log.type}] ` : '';
        return `${container}${stream}${log.content}`;
      })
      .join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `container-logs-${selectedContainer}-${new Date().toISOString().slice(0, 19)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs, selectedContainer]);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">{t('monitoring.logs.title')}</h1>
        <p className="text-sm text-gray-600">{t('monitoring.logs.description')}</p>
      </div>

      <LogStreamConfiguration
        selectedContainer={selectedContainer}
        onSelectedContainerChange={setSelectedContainer}
        tailLines={tailLines}
        onTailLinesChange={setTailLines}
        isStreaming={isStreaming}
        onStartStreaming={handleStartStreaming}
        onStopStreaming={handleStopStreaming}
        onClearLogs={handleClearLogs}
        loading={isLoading}
        error={error}
      />

      <LogViewer
        logs={logs}
        isStreaming={isStreaming}
        selectedContainer={selectedContainer}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        onDownloadLogs={handleDownloadLogs}
      />
    </div>
  );
}
