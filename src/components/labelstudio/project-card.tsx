import ModelTypeBadge from '@/components/model-type-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Project } from '@/entities/labelstudio';
import { Lightbulb, List, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { ProjectCardDropdown } from './project-card-dropdown';
import ProjectEditDialog from './project-edit-dialog';

export function ProjectCard({
  project,
  onClick,
  onEditSubmit,
  onExport,
}: {
  project: Project;
  onClick?: (project: Project) => void;
  onEditSubmit?: (project: Project) => Promise<Project | null>;
  onExport?: (project: Project) => void;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <>
      <Card
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => onClick?.(project)}
        data-testid={`project-card-${project.id}`}
      >
        <CardHeader>
          <div className="flex justify-between w-full">
            <div className="flex gap-4 items-center">
              <div className="w-12 h-12 rounded-full bg-gray-300 opacity-90 flex items-center justify-center text-white font-semibold font-mono text-xl">
                {project.title.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col gap-y-0.5 items-start">
                <CardTitle className="text-base">{project.title}</CardTitle>
                <ModelTypeBadge type={project.type} />
              </div>
            </div>
            <ProjectCardDropdown
              projectId={project.id}
              onEditAction={() => setIsDialogOpen(true)}
              onExportAction={() => onExport?.(project)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex flex-row gap-2 items-center">
              <ListChecks className="size-4" />
              <span>{project.finishedTasksCount}</span>
              <span>/</span>
              <span>{project.totalTasksCount}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-row gap-2 items-center">
                <List className="size-4" />0
              </div>
              <div className="flex flex-row gap-2 items-center">
                <Lightbulb className="size-4" />0
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <ProjectEditDialog
        project={project}
        open={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        loading={isLoading}
        onSubmit={async (e) => {
          if (onEditSubmit) {
            setIsLoading(true);
            try {
              const result = await onEditSubmit({
                ...project,
                title: e.title,
                type: e.type,
              });

              // Close the dialog if the update was successful
              if (result) {
                setIsDialogOpen(false);
              }
            } finally {
              setIsLoading(false);
            }
          }
        }}
        onExport={onExport}
      />
    </>
  );
}
