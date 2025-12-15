'use client';

import PageHeader from '@/components/models/page-header';
import { TrainButton } from '@/components/training/TrainingButton';
import { TrainingSelectionPanel } from '@/components/training/TrainingSelectionPanel';
import { TrainingStatusPanel } from '@/components/training/TrainingStatusPanel';
import { useI18n } from '@/contexts/I18nContext';
import { ModelType } from '@/entities/ml-model';
import { useBackgroundTraining } from '@/hooks/train/use-background-training';
import { useTrainingSetup } from '@/hooks/train/use-training-setup';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo } from 'react';

function ModelTrainingPageContent() {
  const searchParams = useSearchParams();
  const type = searchParams.get('type');
  const modelId = searchParams.get('modelId');
  const versionId = searchParams.get('versionId');

  const tasks = useMemo(() => {
    return ModelType.allCases().map((type) => {
      return {
        id: type,
        name: type,
      };
    });
  }, []);

  const trainingSetup = useTrainingSetup();

  const isAllSelected = useMemo(() => {
    return Boolean(
      trainingSetup.selectedType &&
        trainingSetup.selectedProject &&
        trainingSetup.selectedModel &&
        trainingSetup.selectedVersion,
    );
  }, [
    trainingSetup.selectedType,
    trainingSetup.selectedProject,
    trainingSetup.selectedModel,
    trainingSetup.selectedVersion,
  ]);

  const trainingState = useBackgroundTraining({
    modelId: trainingSetup.selectedModel?.id
      ? parseInt(trainingSetup.selectedModel.id)
      : 0,
    taskIds: [1, 2, 3, 4, 5], // TODO: Use actual task IDs
    modelVersionID: trainingSetup.selectedVersion?.id
      ? trainingSetup.selectedVersion.id
      : 0,
    modelType: trainingSetup.selectedType,
    projectName: trainingSetup.selectedProject?.title,
    isAllSelected,
  });

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <TrainingSelectionPanel
            tasks={tasks}
            selectedType={trainingSetup.selectedType}
            selectedProject={trainingSetup.selectedProject}
            selectedModel={trainingSetup.selectedModel}
            selectedVersion={trainingSetup.selectedVersion}
            availableProjects={trainingSetup.availableProjects}
            availableModels={trainingSetup.availableModels}
            availableVersions={trainingSetup.availableVersions}
            setSelectedType={trainingSetup.setSelectedType}
            setSelectedProject={trainingSetup.setSelectedProject}
            setSelectedModel={trainingSetup.setSelectedModel}
            setSelectedVersion={trainingSetup.setSelectedVersion}
            isTraining={trainingState.isTraining}
          />

          <TrainButton
            onClick={trainingState.startTraining}
            progress={trainingState.isStarting || trainingState.isTraining}
            disabled={!trainingState.canStartTraining}
          />
        </div>

        <div>
          <TrainingStatusPanel
            isTraining={trainingState.isTraining}
            trainingProgress={trainingState.trainingProgress}
            currentEpoch={trainingState.currentEpoch}
            totalEpochs={trainingState.totalEpochs}
            trainingLoss={trainingState.trainingLoss}
          />
        </div>
      </div>
    </div>
  );
}

export default function ModelTrainingPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<div className="p-6">Loading training setup...</div>}>
      <PageHeader
        title={t('trainingPage.title')}
        subtitle={t('trainingPage.description')}
      />
      <ModelTrainingPageContent />
    </Suspense>
  );
}
