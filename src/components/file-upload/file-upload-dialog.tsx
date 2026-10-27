'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';
import FileUpload from './file-upload';
import { useI18n } from '@/contexts/I18nContext';

type FileItem = {
  file: File | { type: string; name: string; size: number };
  id: string;
};

type Project = {
  id: string;
  title: string;
};

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  projects?: Project[];
  selectedProjectId?: string;
  onProjectChange?: (projectId: string) => void;
  onUpload?: (files: FileItem[], projectId?: string) => Promise<void> | void;
}

export function FileUploadDialog({
  open,
  onOpenChange,
  title,
  description,
  projects = [],
  selectedProjectId,
  onProjectChange,
  onUpload,
}: FileUploadDialogProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { t } = useI18n();

  const handleUpload = async () => {
    if (!onUpload || files.length === 0) return;

    setIsUploading(true);
    try {
      await onUpload(files, selectedProjectId);
      setFiles([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? t('labeling.uploadDialogTitle')}</DialogTitle>
          <DialogDescription>
            {description ?? t('labeling.uploadDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {projects.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t('labeling.selectProject')}
              </label>
              <Select value={selectedProjectId} onValueChange={onProjectChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('labeling.chooseProjectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <FileUpload onFilesChange={setFiles} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleUpload}
            disabled={
              files.length === 0 ||
              isUploading ||
              (!selectedProjectId && projects.length > 0)
            }
          >
            {isUploading ? t('common.uploading') : t('labeling.uploadDialogTitle')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
