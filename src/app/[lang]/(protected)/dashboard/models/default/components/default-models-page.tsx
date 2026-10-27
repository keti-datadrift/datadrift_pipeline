'use client';

import { Activity } from 'lucide-react';

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
    <div className="min-h-screen bg-background">
      <PageHeader
        title={t('defaultModelsPage.title')}
        subtitle={t('defaultModelsPage.subtitle')}
        icon={Activity}
      />
      <div className="container mx-auto px-6 py-8 space-y-8">
        {defaultsStatus === 'error' && !hasDefaults ? (
          <DefaultsErrorAlert
            message={defaultsError}
            onRetryAction={() => {
              void loadDefaultModels();
            }}
          />
        ) : null}

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <VersionDetails
              selectedVersion={selectedVersion}
              versionMetrics={versionMetrics}
              isSelectedVersionDefault={isSelectedVersionDefault}
              updateStatus={updateStatus}
              updateMessage={updateMessage}
              onUpdateDefault={updateDefault}
            />
          </div>
          <div>
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
      </div>
    </div>
  );
}
