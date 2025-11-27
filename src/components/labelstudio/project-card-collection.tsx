import { Project } from '@/entities/labelstudio';
import CardCollection from '../card-collection';
import { ProjectCard } from './project-card';

export function ProjectCardCollection({
  projects,
  onProjectClick,
  onProjectEdit,
}: {
  projects: Project[];
  onProjectClick?: (project: Project) => void;
  onProjectEdit?: (project: Project) => Promise<Project | null>;
}) {
  return (
    <CardCollection
      data={projects}
      renderCard={(project, index) => (
        <ProjectCard
          key={project.id || index}
          project={project}
          onClick={onProjectClick}
          onEditSubmit={onProjectEdit}
        />
      )}
      columns={{ default: 1, md: 2, lg: 3 }}
      gap="md"
    />
  );
}
