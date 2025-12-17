import { useCallback, useEffect, useMemo, useState } from 'react';

import { APIError } from '@/api/types';
import {
  DefaultModel,
  DefaultModelVersion,
  ModelType,
} from '@/entities/ml-model';
import {
  getDefaultModels,
  getVersionsByType,
  updateDefaultModelFor,
} from '@/lib/api/endpoints/defaults';

export type LoadState = 'idle' | 'loading' | 'error';

export type VersionMetricKey = 'precision' | 'recall' | 'map50' | 'map5095';

export type VersionMetric = {
  key: VersionMetricKey;
  value: number | null;
  formatter?: (value: number) => string;
};

type DefaultModelMap = Partial<Record<ModelType, DefaultModel>>;

interface UseDefaultModelsOptions {
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useDefaultModelsPage({ t }: UseDefaultModelsOptions) {
  const [defaultModels, setDefaultModels] = useState<DefaultModelMap>({});
  const [defaultsStatus, setDefaultsStatus] = useState<LoadState>('idle');
  const [defaultsError, setDefaultsError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<ModelType | null>(null);
  const [versions, setVersions] = useState<DefaultModelVersion[]>([]);
  const [versionsStatus, setVersionsStatus] = useState<LoadState>('idle');
  const [versionsError, setVersionsError] = useState<string | null>(null);

  const [selectedVersionID, setSelectedVersionID] = useState<number | null>(
    null,
  );
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const hasDefaults = useMemo(
    () => Object.keys(defaultModels).length > 0,
    [defaultModels],
  );

  const loadDefaultModels = useCallback(async () => {
    setDefaultsStatus('loading');
    setDefaultsError(null);

    try {
      const response = await getDefaultModels();
      const normalized: DefaultModelMap = {};

      Object.values(response).forEach((model) => {
        try {
          const type =
            typeof model.type === 'string'
              ? ModelType.fromString(model.type as unknown as string)
              : model.type;
          normalized[type] = {
            ...model,
            type,
          };
        } catch {
          console.warn('Skipping unknown model type in defaults:', model.type);
        }
      });

      setDefaultModels(normalized);
      setDefaultsStatus('idle');
    } catch (error) {
      const fallbackMessage = t(
        'defaultModelsPage.messages.loadDefaultsFallback',
      );
      const message =
        error instanceof APIError
          ? error.message
          : error instanceof Error
            ? error.message
            : fallbackMessage;
      setDefaultsError(message);
      setDefaultsStatus('error');
    }
  }, [t]);

  const loadVersionsForType = useCallback(
    async (type: ModelType) => {
      setVersionsStatus('loading');
      setVersionsError(null);
      try {
        const fetchedVersions = await getVersionsByType(type);
        setVersions(fetchedVersions);
        setVersionsStatus('idle');
      } catch (error) {
        const fallbackMessage = t(
          'defaultModelsPage.messages.loadVersionsFallback',
        );
        const message =
          error instanceof APIError
            ? error.message
            : error instanceof Error
              ? error.message
              : fallbackMessage;
        setVersions([]);
        setVersionsError(message);
        setVersionsStatus('error');
      }
    },
    [t],
  );

  const selectType = useCallback(
    async (type: ModelType) => {
      setSelectedType(type);
      await loadVersionsForType(type);
    },
    [loadVersionsForType],
  );

  const reloadSelectedTypeVersions = useCallback(async () => {
    if (!selectedType) return;
    await loadVersionsForType(selectedType);
  }, [selectedType, loadVersionsForType]);

  const updateDefault = useCallback(async () => {
    if (!selectedType || selectedVersionID == null) {
      return;
    }

    const selectedVersion = versions.find(
      (version) => version.id === selectedVersionID,
    );

    if (!selectedVersion) {
      return;
    }

    setUpdateStatus('loading');
    setUpdateMessage(null);

    try {
      const response = await updateDefaultModelFor(
        selectedType,
        String(selectedVersionID),
      );
      await loadDefaultModels();
      setUpdateStatus('success');
      const fallbackSuccessMessage = t(
        'defaultModelsPage.messages.updateSuccessFallback',
      );
      setUpdateMessage(response.detail || fallbackSuccessMessage);
    } catch (error) {
      const fallbackErrorMessage = t(
        'defaultModelsPage.messages.updateErrorFallback',
      );
      const message =
        error instanceof APIError
          ? error.message
          : error instanceof Error
            ? error.message
            : fallbackErrorMessage;
      setUpdateStatus('error');
      setUpdateMessage(message);
    }
  }, [selectedType, selectedVersionID, versions, loadDefaultModels, t]);

  useEffect(() => {
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      loadDefaultModels().then(() => {
        if (cancelled) return;
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [loadDefaultModels]);

  useEffect(() => {
    if (selectedType || !hasDefaults) {
      return;
    }

    const availableTypes = ModelType.allCases();
    const firstTypeWithDefault = availableTypes.find(
      (type) => defaultModels[type] !== undefined,
    );
    const fallbackType = firstTypeWithDefault ?? availableTypes[0];

    if (fallbackType) {
      const rafId = requestAnimationFrame(() => {
        void selectType(fallbackType);
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [selectedType, hasDefaults, defaultModels, selectType]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      if (!selectedType || versions.length === 0) {
        setSelectedVersionID(null);
        return;
      }

      const defaultModel = defaultModels[selectedType];
      if (defaultModel) {
        const match = versions.find(
          (version) => version.version === defaultModel.version,
        );
        if (match) {
          setSelectedVersionID(match.id);
          return;
        }
      }

      setSelectedVersionID(versions[0]?.id ?? null);
    });
    return () => cancelAnimationFrame(rafId);
  }, [selectedType, versions, defaultModels]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setUpdateStatus('idle');
      setUpdateMessage(null);
    });
    return () => cancelAnimationFrame(rafId);
  }, [selectedVersionID, selectedType]);

  const selectedTypeDefault = useMemo(() => {
    if (!selectedType) return null;
    return defaultModels[selectedType] ?? null;
  }, [defaultModels, selectedType]);

  const selectedVersion = useMemo(() => {
    if (selectedVersionID == null) return null;
    return versions.find((version) => version.id === selectedVersionID) ?? null;
  }, [selectedVersionID, versions]);

  const isSelectedVersionDefault = useMemo(() => {
    if (!selectedTypeDefault || !selectedVersion) return false;
    return selectedTypeDefault.version === selectedVersion.version;
  }, [selectedTypeDefault, selectedVersion]);

  const versionMetrics: VersionMetric[] = useMemo(() => {
    if (!selectedVersion || !selectedVersion.trainingMetrics) return [];

    return [
      {
        key: 'precision',
        value: selectedVersion.trainingMetrics.precision ?? null,
        formatter: (value) => `${(value * 100).toFixed(1)}%`,
      },
      {
        key: 'recall',
        value: selectedVersion.trainingMetrics.recall ?? null,
        formatter: (value) => `${(value * 100).toFixed(1)}%`,
      },
      {
        key: 'map50',
        value: selectedVersion.trainingMetrics.map50 ?? null,
        formatter: (value) => value.toFixed(3),
      },
      {
        key: 'map5095',
        value: selectedVersion.trainingMetrics.map50to95 ?? null,
        formatter: (value) => value.toFixed(3),
      },
    ];
  }, [selectedVersion]);

  return {
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
    selectVersion: setSelectedVersionID,
    selectedVersion,
    selectedTypeDefault,
    isSelectedVersionDefault,
    versionMetrics,
    updateStatus,
    updateMessage,
    updateDefault,
  };
}
