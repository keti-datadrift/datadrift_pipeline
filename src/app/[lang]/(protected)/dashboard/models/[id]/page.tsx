'use client';

import { useRouter } from 'next/navigation';
import { memo, use, useCallback, useMemo, useState } from 'react';

import PageHeader from '@/components/models/page-header';
import VersionForkDialog from '@/components/models/version-fork-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ModelVersion } from '@/entities/ml-model';
import { useModel, useModelVersions } from '@/hooks/network/models';
import { deleteModelVersion, forkModelVersion } from '@/lib/api/endpoints';

import { columns } from './columns';
import { DataTable } from './data-table';
import { useI18n } from '@/contexts/I18nContext';
import PageHeader from '@/components/models/page-header';

const MemoizedDataTable = memo(
  ({ versions, columns }: { versions: ModelVersion[]; columns: any[] }) => {
    return <DataTable data={versions} columns={columns} />;
  },
  (prevProps, nextProps) => {
    // Custom comparison function for better memoization
    if (prevProps.versions.length !== nextProps.versions.length) return false;
    if (prevProps.columns.length !== nextProps.columns.length) return false;

    // Compare versions array
    for (let i = 0; i < prevProps.versions.length; i++) {
      const prevVersion = prevProps.versions[i];
      const nextVersion = nextProps.versions[i];
      if (!prevVersion || !nextVersion) return false;
      if (
        prevVersion.version !== nextVersion.version ||
        (prevVersion as any).isSelected !== (nextVersion as any).isSelected
      ) {
        return false;
      }
    }

    return true;
  },
);
MemoizedDataTable.displayName = 'MemoizedDataTable';

/**
 * Component for rendering loading skeleton
 */
function ModelVersionPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header Skeleton */}
      <div className="mb-8">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Model Versions Table Skeleton */}
      <div className="mb-8">
        <Card>
          <CardHeader>
            <div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Table header skeleton */}
              <div className="flex space-x-4">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-20" />
              </div>
              {/* Table rows skeleton */}
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ModelVersionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = useI18n();
  const { id } = use(params);
  const modelId = Number(id);
  const router = useRouter();

  const { data: model, loading: modelLoading } = useModel(modelId);
  const { data: versions, loading: versionsLoading } =
    useModelVersions(modelId);

  const selectedVersion = model?.version ?? null;
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [selectedVersionForFork, setSelectedVersionForFork] = useState<
    number | null
  >(null);

  const memoizedVersions = useMemo(() => {
    if (!versions) return [];

    return versions.map((version: ModelVersion) => ({
      ...version,
      isSelected: version.version === selectedVersion,
    }));
  }, [versions, selectedVersion]);

  const handleVersionDelete = useCallback(
    async (versionId: number) => {
      if (!window.confirm(t('models.delete.confirmMessage'))) {
        return;
      }

      try {
        await deleteModelVersion(versionId);
        setTimeout(() => {
          router.refresh();
        }, 0);
      } catch (error) {
        console.error('Failed to delete version:', error);
        alert(t('models.delete.errorMessage'));
      }
    },
    [t, router],
  );

  const handleVersionFork = useCallback((versionId: number) => {
    setSelectedVersionForFork(versionId);
    setForkDialogOpen(true);
  }, []);

  const handleForkSubmit = useCallback(
    async (name: string, notes?: string) => {
      if (!selectedVersionForFork) return;

      try {
        await forkModelVersion(selectedVersionForFork, name, notes);
        setForkDialogOpen(false);
        setSelectedVersionForFork(null);
        router.push('/dashboard/models');
      } catch (error) {
        console.error('Failed to fork version:', error);
        throw error;
      }
    },
    [selectedVersionForFork, router],
  );

  const memoizedColumns = useMemo(
    () => columns(handleVersionDelete, handleVersionFork),
    [handleVersionDelete, handleVersionFork],
  );

  if (modelLoading || versionsLoading) {
    return <ModelVersionPageSkeleton />;
  }

  if (!model) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-red-600">
          {t('models.detail.error')}
        </h1>
        <p className="text-gray-500">{t('models.detail.modelNotFound')}</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={model.name} />
      <div className="container mx-auto px-4 py-8">
        {/* Model Versions Table */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t('modelDetail.modelVersions')}</CardTitle>
                <p className="text-sm text-gray-500">
                  {t('modelDetail.totalVersions', {
                    count: memoizedVersions.length,
                  })}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <MemoizedDataTable
                versions={memoizedVersions}
                columns={memoizedColumns}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      <VersionForkDialog
        open={forkDialogOpen}
        onOpenChange={setForkDialogOpen}
        onSubmit={handleForkSubmit}
        defaultModelName={model?.name ? `${model.name}-copy` : undefined}
      />
    </div>
  );
}
