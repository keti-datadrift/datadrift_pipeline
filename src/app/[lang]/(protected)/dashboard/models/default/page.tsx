'use client';

import { APIError } from '@/api/types';
import PageHeader from '@/components/models/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { DefaultModel, ModelType, ModelVersion } from '@/entities/ml-model';
import {
  getDefaultModels,
  getVersionsByType,
  updateDefaultModelFor,
} from '@/lib/api/endpoints/defaults';
import { cn } from '@/lib/utils/tailwind.util';
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CpuIcon,
  Eye,
  FileText,
  TableIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type DefaultModelMap = Partial<Record<ModelType, DefaultModel>>;

type IconType = React.ComponentType<{ className?: string }>;

const MODEL_TYPE_META: Record<
  ModelType,
  { icon: IconType; description: string }
> = {
  [ModelType.LAYOUT]: {
    icon: CpuIcon,
    description: 'Detect and analyze document layouts',
  },
  [ModelType.OCRCLS]: {
    icon: Boxes,
    description: 'Classify OCR regions and page orientation',
  },
  [ModelType.OCRREC]: {
    icon: Eye,
    description: 'Recognize characters from images',
  },
  [ModelType.OCRDET]: {
    icon: FileText,
    description: 'Detect text regions within documents',
  },
  [ModelType.TABREC]: {
    icon: TableIcon,
    description: 'Extract structured information from tables',
  },
};

type LoadState = 'idle' | 'loading' | 'error';

type VersionMetrics = {
  label: string;
  value: number | null;
  formatter?: (value: number) => string;
};

export default function DefaultModelsPage() {
  const [defaultModels, setDefaultModels] = useState<DefaultModelMap>({});
  const [defaultsStatus, setDefaultsStatus] = useState<LoadState>('idle');
  const [defaultsError, setDefaultsError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<ModelType | null>(null);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [versionsStatus, setVersionsStatus] = useState<LoadState>('idle');
  const [versionsError, setVersionsError] = useState<string | null>(null);

  const [selectedVersionID, setSelectedVersionID] = useState<number | null>(
    null,
  );
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const hasDefaults = Object.keys(defaultModels).length > 0;

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
      const message =
        error instanceof APIError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to load default models';
      setDefaultsError(message);
      setDefaultsStatus('error');
    }
  }, []);

  const loadVersionsForType = useCallback(async (type: ModelType) => {
    setVersionsStatus('loading');
    setVersionsError(null);
    try {
      const fetchedVersions = await getVersionsByType(type);
      setVersions(fetchedVersions);
      setVersionsStatus('idle');
    } catch (error) {
      const message =
        error instanceof APIError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to load versions for selected model type';
      setVersions([]);
      setVersionsError(message);
      setVersionsStatus('error');
    }
  }, []);

  const refreshSelectedVersion = useCallback(
    (type: ModelType | null, versionsList: ModelVersion[]) => {
      if (!type || versionsList.length === 0) {
        setSelectedVersionID(null);
        return;
      }

      const defaultModel = defaultModels[type];
      if (defaultModel) {
        const match = versionsList.find(
          (version) => version.version === defaultModel.version,
        );
        if (match) {
          setSelectedVersionID(match.id);
          return;
        }
      }

      setSelectedVersionID(versionsList[0]?.id ?? null);
    },
    [defaultModels],
  );

  const handleSelectType = useCallback(
    async (type: ModelType) => {
      setSelectedType(type);
      await loadVersionsForType(type);
    },
    [loadVersionsForType],
  );

  const handleUpdateDefault = useCallback(async () => {
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
      setUpdateMessage(response.detail || 'Default model updated successfully');
    } catch (error) {
      const message =
        error instanceof APIError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to update default model';
      setUpdateStatus('error');
      setUpdateMessage(message);
    }
  }, [selectedType, selectedVersionID, versions, loadDefaultModels]);

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

  const versionMetrics: VersionMetrics[] = useMemo(() => {
    if (!selectedVersion) return [];

    return [
      {
        label: 'Precision',
        value: selectedVersion.trainingMetrics.precision,
        formatter: (value) => `${(value * 100).toFixed(1)}%`,
      },
      {
        label: 'Recall',
        value: selectedVersion.trainingMetrics.recall,
        formatter: (value) => `${(value * 100).toFixed(1)}%`,
      },
      {
        label: 'mAP50',
        value: selectedVersion.trainingMetrics.map50,
        formatter: (value) => value.toFixed(3),
      },
      {
        label: 'mAP50-95',
        value: selectedVersion.trainingMetrics.map50to95,
        formatter: (value) => value.toFixed(3),
      },
    ];
  }, [selectedVersion]);

  useEffect(() => {
    loadDefaultModels();
  }, [loadDefaultModels]);

  useEffect(() => {
    if (!selectedType && hasDefaults) {
      const availableTypes = ModelType.allCases();
      const firstType = availableTypes.find(
        (type) => defaultModels[type] !== undefined,
      );
      const fallback = firstType ?? availableTypes[0];
      if (fallback) {
        void handleSelectType(fallback);
      }
    }
  }, [selectedType, hasDefaults, defaultModels, handleSelectType]);

  useEffect(() => {
    refreshSelectedVersion(selectedType, versions);
  }, [selectedType, versions, refreshSelectedVersion]);

  useEffect(() => {
    setUpdateStatus('idle');
    setUpdateMessage(null);
  }, [selectedVersionID, selectedType]);

  const renderDefaultsError = () => (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Unable to load default models</AlertTitle>
      <AlertDescription>
        {defaultsError}
        <Button
          variant="link"
          size="sm"
          className="ml-2 px-0"
          onClick={loadDefaultModels}
        >
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );

  const renderTypeCards = () => (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Model Types</h2>
        {defaultsStatus === 'loading' && hasDefaults ? (
          <span className="text-sm text-muted-foreground">Refreshing…</span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ModelType.allCases().map((type) => {
          const MetaIcon = MODEL_TYPE_META[type].icon;
          const defaultModel = defaultModels[type];
          const isSelected = selectedType === type;

          return (
            <Card
              key={type}
              className={cn(
                'cursor-pointer transition-colors',
                isSelected ? 'ring-2 ring-primary' : '',
              )}
              onClick={() => handleSelectType(type)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MetaIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {ModelType.presentationName(type)}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {MODEL_TYPE_META[type].description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {defaultModel ? (
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{defaultModel.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Version {defaultModel.version}
                      </p>
                    </div>
                    <Badge variant="outline">Default</Badge>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No default model configured
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const renderVersionsList = () => {
    if (!selectedType) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Select a model type</CardTitle>
            <CardDescription>
              Choose a model type to view available versions.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    if (versionsStatus === 'loading' && versions.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Loading versions…</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      );
    }

    if (versionsStatus === 'error') {
      return (
        <Card>
          <CardHeader>
            <CardTitle>
              {ModelType.presentationName(selectedType)} versions
            </CardTitle>
            <CardDescription>
              Unable to load model versions. Try again in a moment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Failed to load versions</AlertTitle>
              <AlertDescription className="flex items-center gap-2">
                <span>{versionsError}</span>
                <Button
                  size="sm"
                  onClick={() => loadVersionsForType(selectedType)}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      );
    }

    if (versions.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>
              {ModelType.presentationName(selectedType)} versions
            </CardTitle>
            <CardDescription>No versions available.</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>
            {ModelType.presentationName(selectedType)} versions
          </CardTitle>
          <CardDescription>
            Select a version to review metrics and set it as default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0">
          {versions.map((version, index) => {
            const isSelected = selectedVersionID === version.id;
            const isDefault = selectedTypeDefault?.version === version.version;

            return (
              <div key={version.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full text-left p-4 transition-colors',
                    'hover:bg-accent/60',
                    isSelected ? 'bg-accent' : '',
                  )}
                  onClick={() => setSelectedVersionID(version.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{version.version}</p>
                      <p className="text-xs text-muted-foreground">
                        Trained {version.trainedAt}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isDefault ? (
                        <Badge variant="default">Current Default</Badge>
                      ) : null}
                      {isSelected ? (
                        <Badge variant="outline">Selected</Badge>
                      ) : null}
                    </div>
                  </div>
                </button>
                {index < versions.length - 1 ? <Separator /> : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  const renderVersionDetails = () => {
    if (!selectedVersion || !selectedType) {
      return (
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Version details</CardTitle>
            <CardDescription>
              Select a version to inspect training metrics.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    const isLoadingUpdate = updateStatus === 'loading';

    return (
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {selectedVersion.version}
                {isSelectedVersionDefault ? (
                  <Badge variant="default">Current Default</Badge>
                ) : null}
              </CardTitle>
              <CardDescription>
                Trained {selectedVersion.trainedAt}
              </CardDescription>
            </div>
            <Button
              onClick={handleUpdateDefault}
              disabled={isSelectedVersionDefault || isLoadingUpdate}
            >
              {isSelectedVersionDefault
                ? 'Already default'
                : isLoadingUpdate
                  ? 'Updating…'
                  : 'Set as default'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {updateStatus === 'success' && updateMessage ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Default model updated</AlertTitle>
              <AlertDescription>{updateMessage}</AlertDescription>
            </Alert>
          ) : null}
          {updateStatus === 'error' && updateMessage ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Update failed</AlertTitle>
              <AlertDescription>{updateMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold mb-3">Training metrics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {versionMetrics.map((metric) => (
                <Card key={metric.label} className="bg-muted/40">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                      {metric.label}
                    </p>
                    <p className="text-lg font-semibold">
                      {typeof metric.value === 'number'
                        ? metric.formatter
                          ? metric.formatter(metric.value)
                          : metric.value.toFixed(3)
                        : 'N/A'}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Training progress</h3>
            <div className="space-y-3">
              {versionMetrics.map((metric) => (
                <div key={`progress-${metric.label}`}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">
                      {metric.label}
                    </span>
                    <span className="font-medium">
                      {typeof metric.value === 'number'
                        ? metric.formatter
                          ? metric.formatter(metric.value)
                          : metric.value.toFixed(3)
                        : 'N/A'}
                    </span>
                  </div>
                  <Progress
                    value={
                      typeof metric.value === 'number'
                        ? Math.max(
                            0,
                            Math.min(
                              100,
                              metric.label === 'Precision' ||
                                metric.label === 'Recall'
                                ? metric.value * 100
                                : metric.value * 100,
                            ),
                          )
                        : 0
                    }
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Default Models"
        subtitle="Review and manage the default model version for each task type"
        icon={Activity}
      />
      <div className="container mx-auto px-6 py-8 space-y-8">
        {defaultsStatus === 'error' && !hasDefaults
          ? renderDefaultsError()
          : null}

        {defaultsStatus === 'loading' && !hasDefaults ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full" />
            ))}
          </div>
        ) : (
          renderTypeCards()
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {renderVersionDetails()}
          </div>
          <div>{renderVersionsList()}</div>
        </div>
      </div>
    </div>
  );
}
