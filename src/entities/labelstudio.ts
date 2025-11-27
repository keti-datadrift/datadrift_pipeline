export interface Project {
  id: string;
  title: string;
  color: string;
  type: ModelType;
  finishedTasksCount: number;
  totalTasksCount: number;
  annotationsCount: number;
  predictionsCount: number;
}
