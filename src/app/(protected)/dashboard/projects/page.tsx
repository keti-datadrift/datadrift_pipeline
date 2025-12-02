'use client';

import { ProjectCardCollection } from '@/components/labelstudio/project-card-collection';
import { Project } from '@/entities/labelstudio';
import { useProjects, useUpdateProject } from '@/hooks/network/projects';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export default function LabelStudioPage() {
  const router = useRouter();
  const { data: projects, refetch } = useProjects();
  const { requestFn: updateProject } = useUpdateProject();

  const handleProjectEdit = useCallback(
    async (project: Project): Promise<Project | null> => {
      try {
        const response = await updateProject(project, {
          title: project.title,
          ml_model_type: project.type,
        });

        if (response) {
          // Refetch the projects list to get the updated data
          await refetch();
          return response;
        }
        return null;
      } catch (error) {
        console.error('Failed to update project:', error);
        return null;
      }
    },
    [updateProject, refetch],
  );

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Label Studio</h1>
        <p className="text-sm">Manage and monitor your AI models</p>
      </div>

      {/* Projects Collection */}
      <div className="mb-8">
        <ProjectCardCollection
          projects={projects}
          onProjectClick={(project) => {
            router.push(`/dashboard/projects/${project.id}`);
          }}
          onProjectEdit={handleProjectEdit}
        />
      </div>
    </div>
  );
}
