'use client';

import { StatCard } from '@/components/stat-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Model } from '@/entities/ml-model';
import { useModels } from '@/hooks/network/models';
import { ColumnFiltersState, OnChangeFn } from '@tanstack/react-table';
import { AlertCircle, PanelsLeftBottom, Search, Signature, Table2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import { columns } from './columns';
import { DataTable } from './data-table';
import { useI18n } from '@/contexts/I18nContext';

/**
 * Custom hook for managing column filters
 */
function useColumnFilters() {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const handleColumnFiltersChange: OnChangeFn<ColumnFiltersState> = useCallback(
    (updater) => {
      setColumnFilters((prev) =>
        typeof updater === 'function' ? updater(prev) : updater,
      );
    },
    [],
  );

  const searchValue = useMemo(() => {
    return (columnFilters.find((f) => f.id === 'name')?.value as string) ?? '';
  }, [columnFilters]);

  const updateSearchFilter = useCallback(
    (value: string) => {
      handleColumnFiltersChange((prev) =>
        value
          ? prev.filter((f) => f.id !== 'name').concat([{ id: 'name', value }])
          : prev.filter((f) => f.id !== 'name'),
      );
    },
    [handleColumnFiltersChange],
  );

  const clearSearchFilter = useCallback(() => {
    handleColumnFiltersChange((prev) => prev.filter((f) => f.id !== 'name'));
  }, [handleColumnFiltersChange]);

  return {
    columnFilters,
    handleColumnFiltersChange,
    searchValue,
    updateSearchFilter,
    clearSearchFilter,
  };
}

/**
 * Component for rendering loading skeleton
 */
function ModelsPageSkeleton() {
  return (
    <div className="container mx-auto">
      <div className="mb-8">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Component for rendering error state
 */
function ModelsPageError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="container mx-auto">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">{t('models.title')}</h1>
        <p className="text-sm text-gray-600">{t('models.description')}</p>
      </div>

      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={onRetry}
            className="ml-4 underline hover:no-underline"
          >
            {t('models.errorTryAgain')}
          </button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default function ModelsPage() {
  const router = useRouter();
  const { t } = useI18n();

  const { data, loading, error, refetch } = useModels();
  const {
    columnFilters,
    handleColumnFiltersChange,
    searchValue,
    updateSearchFilter,
    clearSearchFilter,
  } = useColumnFilters();

  // Memoize computed statistics to prevent unnecessary recalculations
  const stats = useMemo(() => {
    return {
      ocr: data.filter((model) => model.type.startsWith('ocr')).length,
      layout: data.filter((model) => model.type === 'layout').length,
      extraction: data.filter((model) => model.type === 'tabrec').length,
    };
  }, [data]);

  // Handle search input change
  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updateSearchFilter(event.target.value);
    },
    [updateSearchFilter],
  );

  // Handle row click
  const handleRowClick = useCallback(
    (rowData: Model) => {
      const model = data.find((model) => model.id === rowData.id);

      if (model) {
        const { id, ...rest } = model;
        const stringified = Object.entries(rest).reduce(
          (acc, [k, v]) => {
            acc[k] = String(v);
            return acc;
          },
          {} as Record<string, string>,
        );
        const queryParams = new URLSearchParams(stringified);
        router.push(`/dashboard/models/${id}?${queryParams.toString()}`);
      }
    },
    [data, router],
  );

  if (loading) {
    return <ModelsPageSkeleton />;
  }

  if (error) {
    return <ModelsPageError error={error} onRetry={refetch} />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">{t('models.title')}</h1>
        <p className="text-sm text-gray-600">{t('models.description')}</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={t('models.stats.layoutDetection.title')}
          description={t('models.stats.layoutDetection.description')}
          value={stats.layout}
          icon={PanelsLeftBottom}
        />
        <StatCard
          title={t('models.stats.ocr.title')}
          description={t('models.stats.ocr.description')}
          value={stats.ocr}
          icon={Signature}
        />
        <StatCard
          title={t('models.stats.tableRecognition.title')}
          description={t('models.stats.tableRecognition.description')}
          value={stats.extraction}
          icon={Table2}
        />
      </div>

      {/* Models Table */}
      <div className="mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-semibold text-gray-900">
                  {t('models.overview')}
                </CardTitle>
                <CardDescription>{t('models.overviewDescription')}</CardDescription>
              </div>
              <div className="flex items-center">
                <div className="relative flex items-center">
                  <Search className="absolute left-3 size-4 text-gray-400" />
                  <Input
                    placeholder={t('models.searchPlaceholder')}
                    value={searchValue}
                    onChange={handleSearchChange}
                    className="pl-10 pr-10 w-64 focus:w-80 transition-all duration-200"
                    aria-label={t('models.searchPlaceholder')}
                  />
                  {searchValue && (
                    <button
                      onClick={clearSearchFilter}
                      className="absolute right-3 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                      aria-label={t('models.clearSearch')}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              data={data}
              columns={columns}
              columnFilters={columnFilters}
              onColumnFiltersChange={handleColumnFiltersChange}
              onRowClick={handleRowClick}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
