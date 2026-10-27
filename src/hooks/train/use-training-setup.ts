import { Project } from '@/entities/labelstudio';
import { Model, ModelType, ModelVersion } from '@/entities/ml-model';
import { useModels, useModelVersions } from '@/hooks/network/models';
import { useProjects } from '@/hooks/network/projects';
import { useCallback, useMemo, useState } from 'react';

interface TrainingSetupProps {
  selectedType: ModelType | undefined;
  selectedProject: Project | undefined;
  selectedModel: Model | undefined;
  selectedVersion: ModelVersion | undefined;

  availableProjects: Project[];
  availableModels: Model[];
  availableVersions: ModelVersion[];

  setSelectedType: (type: string | undefined) => void;
  setSelectedProject: (project: string | undefined) => void;
  setSelectedModel: (model: string | undefined) => void;
  setSelectedVersion: (version: string | undefined) => void;
}

/**
 * 학습 설정을 관리하는 훅입니다.
 *
 * 1. 학습 타입 선택 시 타입에 해당하는 레이블링 프로젝트와 모델을 서버에 요청
 * 2. 레이블링 프로젝트 선택 시 아무 일도 일어나지 않음 (TODO: 프로젝트 기본 모델 추천으로 상단 정렬)
 * 3. 모델 선택 시 해당 모델의 버전 목록을 서버에 요청
 * 4. 버전 선택 시 아무 일도 일어나지 않음 (TODO: 이전 학습 설정 기본 선택)
 *
 * @returns
 */
export const useTrainingSetup = (): TrainingSetupProps => {
  const [selectedType, setSelectedType] = useState<ModelType | undefined>(
    undefined,
  );
  const [selectedProject, setSelectedProject] = useState<Project | undefined>(
    undefined,
  );
  const [selectedModel, setSelectedModel] = useState<Model | undefined>(
    undefined,
  );
  const [selectedVersion, setSelectedVersion] = useState<
    ModelVersion | undefined
  >(undefined);

  const { data: projects } = useProjects();
  const { data: models } = useModels();
  const { data: modelVersions } = useModelVersions(
    selectedModel ? Number(selectedModel.id) : undefined,
  );

  /** 선택된 Task 타입에 해당하는 레이블링 프로젝트 목록 */
  const availableProjects = useMemo(() => {
    return selectedType
      ? projects.filter((project) => project.type === selectedType)
      : [];
  }, [selectedType, projects]);

  /** 선택된 Task 타입에 해당하는 모델 목록 */
  const availableModels = useMemo(() => {
    return selectedType
      ? models.filter((model) => model.type === selectedType)
      : [];
  }, [selectedType, models]);

  const availableVersions = useMemo(() => {
    return selectedModel
      ? modelVersions.filter(
          (version) => String(version.modelId) === selectedModel.id,
        )
      : [];
  }, [selectedModel, modelVersions]);

  const setSelectedTypeByTypeString = useCallback(
    (typeString: string | undefined) => {
      if (!typeString) return;
      const type = ModelType.fromString(typeString);
      setSelectedType(type);
    },
    [],
  );

  const setSelectedProjectByProjectId = useCallback(
    (projectId: string | undefined) => {
      if (!projectId) {
        console.warn(
          'Project should be selected here, but Project ID is not given',
        );
        return;
      }
      const project = availableProjects.find(
        (project) => project.id === projectId,
      );
      if (!project) {
        console.warn(
          `Project not found with ID ${projectId}. Available projects: ${availableProjects.map((p) => p.id).join(', ')}`,
        );
        return;
      }
      setSelectedProject(project);
    },
    [availableProjects],
  );

  const setSelectedModelByModelId = useCallback(
    (modelId: string | undefined) => {
      if (!modelId) return;
      const model = availableModels.find((model) => model.id === modelId);
      setSelectedModel(model);
    },
    [availableModels],
  );

  const setSelectedModelVersionByVersionString = useCallback(
    (versionString: string | undefined) => {
      if (!versionString) return;

      const version = modelVersions.find(
        (version) => version.version === versionString,
      );
      setSelectedVersion(version);
    },
    [modelVersions],
  );

  return {
    selectedType,
    selectedProject,
    selectedModel,
    selectedVersion,
    availableProjects,
    availableModels,
    availableVersions,
    setSelectedType: setSelectedTypeByTypeString,
    setSelectedProject: setSelectedProjectByProjectId,
    setSelectedModel: setSelectedModelByModelId,
    setSelectedVersion: setSelectedModelVersionByVersionString,
  };
};
