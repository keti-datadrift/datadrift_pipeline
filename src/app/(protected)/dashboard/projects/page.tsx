'use client';

import { FileUploadDialog } from '@/components/file-upload/file-upload-dialog';
import { ProjectCardCollection } from '@/components/labelstudio/project-card-collection';
import { Button } from '@/components/ui/button';
import { Project } from '@/entities/labelstudio';
import { useProjects, useUpdateProject } from '@/hooks/network/projects';
import {
  uploadFilesToProject,
  validateFiles,
} from '@/lib/api/utils/file-upload';
import { Download, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

export default function LabelStudioPage() {
  const router = useRouter();
  const { data: projects, refetch } = useProjects();
  const { requestFn: updateProject } = useUpdateProject();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

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

  const handleUpload = useCallback(() => {
    setUploadDialogOpen(true);
  }, []);

  const handleFileUpload = useCallback(
    async (
      files: Array<{
        file: File | { type: string; name: string; size: number };
        id: string;
      }>,
      projectId?: string,
    ) => {
      const targetProjectId = projectId || selectedProjectId;

      if (!targetProjectId) {
        throw new Error('Please select a project to upload files to');
      }

      // Extract actual File objects from the array
      const actualFiles = files
        .map((f) => f.file)
        .filter((file): file is File => file instanceof File);

      if (actualFiles.length === 0) {
        throw new Error('No valid files to upload');
      }

      // Validate files before upload
      const validation = validateFiles(actualFiles, {
        maxFileSize: 50 * 1024 * 1024, // 50MB per file
        maxFiles: 100, // Maximum 100 files
      });

      if (!validation.isValid) {
        throw new Error(
          `File validation failed: ${validation.errors.join(', ')}`,
        );
      }

      console.log(
        `Uploading ${validation.validFiles.length} files to project ${targetProjectId}`,
      );

      try {
        await uploadFilesToProject(targetProjectId, validation.validFiles);
        console.log('Files uploaded successfully');

        // Refresh projects to update task counts
        await refetch();
      } catch (error) {
        console.error('Upload failed:', error);
        throw error;
      }
    },
    [selectedProjectId, refetch],
  );
  const handleDownload = useCallback(() => {}, []);

  return (
    <div className="container mx-auto">
      {/* Header */}
      <div className="flex flex-row justify-between items-center">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">Label Studio</h1>
          <p className="text-sm">Manage and monitor your AI models</p>
        </div>
        <div className="flex flex-row gap-2 mr-4">
          <Button
            variant="secondary"
            onClick={handleUpload}
            className="w-28 hover:cursor-pointer"
          >
            <Upload className="size-4" />
            Upload
          </Button>
          <Button
            variant="default"
            onClick={handleDownload}
            className="w-32 hover:cursor-pointer"
          >
            <Download className="size-4" />
            Download
          </Button>
        </div>
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

      {/* File Upload Dialog */}
      <FileUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        title="Upload Project Files"
        description="Select files to upload to your project"
        projects={projects?.map((p) => ({ id: p.id, title: p.title })) || []}
        selectedProjectId={selectedProjectId}
        onProjectChange={setSelectedProjectId}
        onUpload={handleFileUpload}
      />
    </div>
  );
}
