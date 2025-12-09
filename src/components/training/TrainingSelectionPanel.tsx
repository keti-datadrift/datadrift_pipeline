import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ModelType } from '@/entities/ml-model';
import { BrainCircuit, Database, Settings2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface TrainingSelectionPanelProps {
  tasks: Array<{ id: string; name: string }>;
  selectedType: ModelType | undefined;
  selectedProject: any;
  selectedModel: any;
  selectedVersion: any;
  availableProjects: any[];
  availableModels: any[];
  availableVersions: any[];
  setSelectedType: (value: string | undefined) => void;
  setSelectedProject: (value: string | undefined) => void;
  setSelectedModel: (value: string | undefined) => void;
  setSelectedVersion: (value: string | undefined) => void;
  isTraining: boolean;
}

export function TrainingSelectionPanel({
  tasks,
  selectedType,
  selectedProject,
  selectedModel,
  selectedVersion,
  availableProjects,
  availableModels,
  availableVersions,
  setSelectedType,
  setSelectedProject,
  setSelectedModel,
  setSelectedVersion,
  isTraining,
}: TrainingSelectionPanelProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold mb-4">{t('trainingPage.selectionsTitle')}</h2>
      <div>{t('trainingPage.selectionsSub')}</div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            {t('trainingPage.taskTitle')}
          </CardTitle>
          <CardDescription>{t('trainingPage.taskDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="task">{t('trainingPage.taskType')}</Label>
            <Select
              key={selectedType || undefined}
              value={selectedType || undefined}
              onValueChange={(value) => {
                const type = ModelType.fromString(value);
                setSelectedType(type);
              }}
              disabled={isTraining}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('trainingPage.selectTaskTypePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {tasks.map((task) => (
                  <SelectItem key={task.id} value={task.name}>
                    {t(`modelType.${task.id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {t('trainingPage.dataTitle')}
          </CardTitle>
          <CardDescription>{t('trainingPage.dataDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="project">{t('trainingPage.labelingProjectLabel')}</Label>
            <Select
              key={selectedProject?.id}
              value={selectedProject?.id}
              onValueChange={setSelectedProject}
              disabled={!selectedType || isTraining}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    selectedType
                      ? t('trainingPage.selectLabelingProjectPlaceholder')
                      : t('trainingPage.selectTaskFirstPlaceholder')
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex items-center justify-between w-full">
                      <span key={project.id}>{project.title}</span>
                      <div className="flex items-center gap-2 ml-4">
                        <Badge variant="secondary">
                          {project.finishedTasksCount.toLocaleString()} {t('trainingPage.samples')}
                        </Badge>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5" />
            {t('trainingPage.modelTitle')}
          </CardTitle>
          <CardDescription>{t('trainingPage.modelDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="model">{t('trainingPage.modelArchitectureLabel')}</Label>
              <Select
                key={selectedModel?.id}
                value={selectedModel?.id}
                onValueChange={setSelectedModel}
                disabled={!selectedType || isTraining}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      selectedType ? t('trainingPage.selectModelPlaceholder') : t('trainingPage.selectTaskFirstPlaceholder')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div key={model.id}>
                        <div className="font-medium">{model.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {model.description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedModel && (
              <div className="space-y-2">
                <Label htmlFor="version">{t('trainingPage.modelVersionLabel')}</Label>
                <Select
                  key={selectedVersion?.version}
                  value={selectedVersion?.version}
                  onValueChange={setSelectedVersion}
                  disabled={isTraining}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('trainingPage.selectVersionPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVersions.map((version) => (
                      <SelectItem key={version.version} value={version.version}>
                        {version.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
