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
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold mb-4">Selections</h2>
      <div>Select dataset and model for training</div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Task
          </CardTitle>
          <CardDescription>Choose the machine learning task</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="task">Task Type</Label>
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
                <SelectValue placeholder="Select a task type" />
              </SelectTrigger>
              <SelectContent>
                {tasks.map((task) => (
                  <SelectItem key={task.id} value={task.name}>
                    {ModelType.presentationName(task.id as ModelType)}
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
            Data
          </CardTitle>
          <CardDescription>Choose a labeling project</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="project">Labeling Project</Label>
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
                      ? 'Select a labeling project'
                      : 'Select a task first'
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
                          {project.finishedTasksCount.toLocaleString()} samples
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
            Model
          </CardTitle>
          <CardDescription>
            Choose model architecture and version
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="model">Model Architecture</Label>
              <Select
                key={selectedModel?.id}
                value={selectedModel?.id}
                onValueChange={setSelectedModel}
                disabled={!selectedType || isTraining}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      selectedType ? 'Select a model' : 'Select a task first'
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
                <Label htmlFor="version">Model Version</Label>
                <Select
                  key={selectedVersion?.version}
                  value={selectedVersion?.version}
                  onValueChange={setSelectedVersion}
                  disabled={isTraining}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a version" />
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
