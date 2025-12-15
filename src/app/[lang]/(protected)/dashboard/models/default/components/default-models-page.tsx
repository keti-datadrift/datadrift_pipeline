'use client';

import { ActivityIcon } from 'lucide-react';

import PageHeader from '@/components/models/page-header';
import { useI18n } from '@/contexts/I18nContext';
import { ModelType } from '@/entities/ml-model';
import { useDefaultModelsPage } from '@/hooks/use-default-models';

import { DefaultsErrorAlert } from './defaults-error-alert';
import { TypeCardGrid, TypeCardSkeletons } from './type-card-grid';
import { VersionDetails } from './version-details';
import { VersionsList } from './versions-list';

export function DefaultModelsPage() {
  const { t } = useI18n();
  const {
    defaultModels,
    defaultsStatus,
    defaultsError,
    hasDefaults,
    loadDefaultModels,
    selectedType,
    selectType,
    reloadSelectedTypeVersions,
    versions,
    versionsStatus,
    versionsError,
    selectedVersionID,
    selectVersion,
    selectedVersion,
    selectedTypeDefault,
    versionMetrics,
    isSelectedVersionDefault,
    updateStatus,
    updateMessage,
    updateDefault,
  } = useDefaultModelsPage({ t });

  const handleSelectType = (type: ModelType) => {
    void selectType(type);
  };

  const handleSelectVersion = (id: number) => {
    selectVersion(id);
  };

  const handleRetryVersions = () => {
    void reloadSelectedTypeVersions();
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <PageHeader
        title={t('defaultModels.title')}
        subtitle={t('defaultModels.subtitle')}
        icon={ActivityIcon}
      />
      <main className="flex flex-1 min-h-0 flex-col">
        <div className="container mx-auto flex h-full w-full flex-1 min-h-0 flex-col gap-6 px-6 py-6">
          {defaultsStatus === 'error' && !hasDefaults ? (
            <DefaultsErrorAlert
              message={defaultsError}
              onRetryAction={() => {
                void loadDefaultModels();
              }}
            />
          ) : null}

          <section className="grid min-h-0 grid-rows-[auto,1fr] gap-6">
            {defaultsStatus === 'loading' && !hasDefaults ? (
              <TypeCardSkeletons />
            ) : (
              <TypeCardGrid
                defaultModels={defaultModels}
                selectedType={selectedType}
                onSelectTypeAction={handleSelectType}
                status={defaultsStatus}
                hasDefaults={hasDefaults}
              />
            )}

            <div className="flex flex-1 min-h-0 flex-col gap-6 md:flex-row">
              <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                <VersionDetails
                  selectedVersion={selectedVersion}
                  versionMetrics={versionMetrics}
                  isSelectedVersionDefault={isSelectedVersionDefault}
                  updateStatus={updateStatus}
                  updateMessage={updateMessage}
                  onUpdateDefaultAction={updateDefault}
                />
              </div>
              <div className="flex min-h-0 flex-col overflow-hidden md:w-[360px]">
                <VersionsList
                  selectedType={selectedType}
                  selectedTypeDefault={selectedTypeDefault}
                  versions={versions}
                  versionsStatus={versionsStatus}
                  versionsError={versionsError}
                  selectedVersionID={selectedVersionID}
                  onSelectVersionAction={handleSelectVersion}
                  onRetryAction={handleRetryVersions}
                />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
