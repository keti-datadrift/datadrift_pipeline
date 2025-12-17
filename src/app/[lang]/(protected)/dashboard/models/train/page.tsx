'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import PageHeader from '@/components/models/page-header';
import { TrainButton } from '@/components/training/TrainingButton';
import { TrainingSelectionPanel } from '@/components/training/TrainingSelectionPanel';
import { TrainingStatusPanel } from '@/components/training/TrainingStatusPanel';
import { useI18n } from '@/contexts/I18nContext';
import { ModelType } from '@/entities/ml-model';
import { useBackgroundTraining } from '@/hooks/train/use-background-training';
import { useTrainingSetup } from '@/hooks/train/use-training-setup';
import { getAnnotatedTasks, getMLBackends } from '@/lib/api/endpoints';

function ModelTrainingPageContent() {
  const searchParams = useSearchParams();
  const type = searchParams.get('type');
  const modelId = searchParams.get('modelId');
  const versionId = searchParams.get('versionId');

  const [taskIds, setTaskIds] = useState<number[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  const [mlBackend, setMLBackend] = useState<number | undefined>(undefined);

  const tasks = useMemo(() => {
    return ModelType.allCases().map((type) => {
      return {
        id: type,
        name: type,
      };
    });
  }, []);

  const trainingSetup = useTrainingSetup();

  useEffect(() => {
    let isMounted = true;
    const projectId = trainingSetup.selectedProject?.id;

    if (!projectId) {
      setTaskIds([]);
      setIsLoadingTasks(false);
      return () => {
        isMounted = false;
      };
    }

    setTaskIds([]);

    const fetchTasks = async () => {
      setIsLoadingTasks(true);
      try {
        const response = await getAnnotatedTasks(projectId);
        const tasks = response.tasks || [];
        if (isMounted) {
          setTaskIds(tasks.map((task) => task.id));
        }
      } catch (error) {
        console.error('Failed to load annotated tasks:', error);
        if (isMounted) {
          setTaskIds([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingTasks(false);
        }
      }
    };

    void fetchTasks();

    return () => {
      isMounted = false;
    };
  }, [trainingSetup.selectedProject?.id]);

  useEffect(() => {
    if (!trainingSetup.selectedProject) return;

    getMLBackends(trainingSetup.selectedProject.id)
      .then((backends) => {
        if (backends.length === 0) {
          setMLBackend(undefined);
        } else if (backends.length === 1) {
          const mlBackendID = backends[0]?.id;
          if (!mlBackendID) return;
          setMLBackend(mlBackendID);
        } else {
          console.warn(
            'Multiple number of ML Backends are fetched. There should be only one.',
          );
          setMLBackend(undefined);
        }
      })
      .catch((error) => {
        console.error('Failed to load ML backends:', error);
      });
  }, [trainingSetup.selectedProject]);

  const selectedModelId = useMemo(() => {
    const id = trainingSetup.selectedModel?.id;
    return id ? Number(id) : undefined;
  }, [trainingSetup.selectedModel]);

  const selectedVersionId = useMemo(() => {
    return trainingSetup.selectedVersion?.id;
  }, [trainingSetup.selectedVersion]);

  const isAllSelected = useMemo(() => {
    return Boolean(
      trainingSetup.selectedType &&
        trainingSetup.selectedProject &&
        trainingSetup.selectedModel &&
        trainingSetup.selectedVersion &&
        taskIds.length > 0,
    );
  }, [
    trainingSetup.selectedType,
    trainingSetup.selectedProject,
    trainingSetup.selectedModel,
    trainingSetup.selectedVersion,
    taskIds.length,
  ]);

  const trainingState = useBackgroundTraining({
    modelId: selectedModelId,
    mlBackendID: mlBackend,
    taskIds,
    modelVersionID: selectedVersionId,
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
            progress={
              trainingState.isStarting ||
              trainingState.isTraining ||
              isLoadingTasks
            }
            disabled={!trainingState.canStartTraining || isLoadingTasks}
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
