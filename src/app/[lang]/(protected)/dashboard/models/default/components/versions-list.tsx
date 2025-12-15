'use client';

import { AlertTriangle } from 'lucide-react';
import { rcompare } from 'semver';

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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/contexts/I18nContext';
import {
  DefaultModel,
  DefaultModelVersion,
  ModelType,
} from '@/entities/ml-model';
import type { LoadState } from '@/hooks/use-default-models';
import { cn } from '@/lib/utils/tailwind.util';

type VersionsListProps = {
  selectedType: ModelType | null;
  selectedTypeDefault: DefaultModel | null;
  versions: DefaultModelVersion[];
  versionsStatus: LoadState;
  versionsError: string | null;
  selectedVersionID: number | null;
  onSelectVersionAction: (id: number) => void;
  onRetryAction: () => void;
};

export function VersionsList({
  selectedType,
  selectedTypeDefault,
  versions,
  versionsStatus,
  versionsError,
  selectedVersionID,
  onSelectVersionAction,
  onRetryAction,
}: VersionsListProps) {
  const { t } = useI18n();

  if (!selectedType) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {t('defaultModels.sections.versions.selectPromptTitle')}
          </CardTitle>
          <CardDescription>
            {t('defaultModels.sections.versions.selectPromptDescription')}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (versionsStatus === 'loading' && versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('defaultModels.sections.versions.loading')}</CardTitle>
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
            {t('defaultModels.sections.versions.title', {
              type: ModelType.presentationName(selectedType),
            })}
          </CardTitle>
          <CardDescription>
            {t('defaultModels.sections.versions.errorDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {t('defaultModels.sections.versions.errorTitle')}
            </AlertTitle>
            <AlertDescription className="flex items-center gap-2">
              <span>{versionsError}</span>
              <Button size="sm" onClick={onRetryAction}>
                {t('defaultModels.buttons.retry')}
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
            {t('defaultModels.sections.versions.title', {
              type: ModelType.presentationName(selectedType),
            })}
          </CardTitle>
          <CardDescription>
            {t('defaultModels.sections.versions.empty')}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0">
        <CardTitle>
          {t('defaultModels.sections.versions.title', {
            type: ModelType.presentationName(selectedType),
          })}
        </CardTitle>
        <CardDescription>
          {t('defaultModels.sections.versions.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-0 overflow-y-auto">
        {versions
          .sort((a, b) => rcompare(a.version, b.version))
          .map((version, index) => {
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
                    isSelected ? '' : 'hover:cursor-pointer',
                  )}
                  onClick={() => onSelectVersionAction(version.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{version.version}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('defaultModels.text.trainedOn', {
                          date: version.trainedAt,
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isDefault ? (
                        <Badge variant="default">
                          {t('defaultModels.badges.currentDefault')}
                        </Badge>
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
}
