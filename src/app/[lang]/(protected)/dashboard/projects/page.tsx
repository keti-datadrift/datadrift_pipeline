'use client';

import React from 'react';
import {
  createExportSnapshot,
  deleteExportSnapshot,
  downloadExportSnapshot,
} from '@/api/endpoints/projects';
import { uploadFilesToProject, validateFiles } from '@/api/utils/file-upload';
import type { SupportedLocales } from '@/app/i18n';
import { getClientDictionary } from '@/app/dictionaries.client';
import { FileUploadDialog } from '@/components/file-upload/file-upload-dialog';
import { ProjectCardCollection } from '@/components/labelstudio/project-card-collection';
import { Button } from '@/components/ui/button';
import { Project } from '@/entities/labelstudio';
import { useProjects, useUpdateProject } from '@/hooks/network/projects';
import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';

export default function LabelingPage({
  params,
}: {
  params: Promise<{ lang: SupportedLocales }>;
}) {
  const { lang } = React.use(params);
  const dict = getClientDictionary(lang);
  const { t } = useI18n();

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

  const handleProjectExport = useCallback(async (project: Project) => {
    try {
      console.log(
        `Starting export for project ${project.title} (${project.id})`,
      );

      // Step 1: Create export snapshot
      const snapshot = await createExportSnapshot(project.id, {
        task_filter_options: {
          annotated: 'only',
        },
      });

      console.log('Export snapshot created:', snapshot);

      // Step 2: Poll until snapshot is completed (max 30 seconds)
      let attempts = 0;
      const maxAttempts = 30;

      if (snapshot.status !== 'completed' && attempts >= maxAttempts) {
        throw new Error('Export snapshot did not complete in time');
      }

      // Step 3: Download the export file
      const blob = await downloadExportSnapshot(project.id, snapshot.id);

      // Step 4: Download with user-selected location
      const fileName = `${project.title}-export-${new Date().toISOString().split('T')[0]}.zip`;

      // Try to use the modern File System Access API
      if ('showSaveFilePicker' in window && window.showSaveFilePicker) {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [
              {
                description: 'ZIP files',
                accept: {
                  'application/zip': ['.zip'],
                },
              },
            ],
          });

          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          // User cancelled or API not supported, fall back to default download
          if (error instanceof Error && error.name !== 'AbortError') {
            console.warn(
              'File System Access API failed, falling back to default download:',
              error,
            );
            downloadFallback(blob, fileName);
          }
        }
      } else {
        // Fallback for browsers that don't support File System Access API
        downloadFallback(blob, fileName);
      }

      function downloadFallback(blob: Blob, filename: string) {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }

      // Step 5: Clean up - delete the snapshot
      await deleteExportSnapshot(project.id, snapshot.id);

      console.log('Project export completed and cleaned up successfully');
    } catch (error) {
      console.error('Project export failed:', error);
      // You might want to show a toast notification here
    }
  }, []);

  return (
    <div className="container mx-auto">
      {/* Header */}
      <div className="flex flex-row justify-between items-center">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">{dict.labeling.title}</h1>
          <p className="text-sm">{t('labeling.description')}</p>
        </div>
        <div className="flex flex-row gap-2 mr-4">
          <Button
            variant="secondary"
            onClick={handleUpload}
            className="w-28 hover:cursor-pointer"
          >
            <Upload className="size-4" />
            {t('labeling.upload')}
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
          onProjectExport={handleProjectExport}
        />
      </div>

      {/* File Upload Dialog */}
      <FileUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        title={t('labeling.uploadDialogTitle')}
        description={t('labeling.uploadDialogDescription')}
        projects={projects?.map((p) => ({ id: p.id, title: p.title })) || []}
        selectedProjectId={selectedProjectId}
        onProjectChange={setSelectedProjectId}
        onUpload={handleFileUpload}
      />
    </div>
  );
}
