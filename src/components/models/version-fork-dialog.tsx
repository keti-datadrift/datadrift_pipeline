'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/contexts/I18nContext';

interface VersionForkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, notes?: string) => Promise<void>;
  defaultModelName?: string;
}

export default function VersionForkDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultModelName,
}: VersionForkDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState(defaultModelName || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError(t('models.fork.nameRequired'));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(name.trim(), notes.trim() || undefined);
      setName('');
      setNotes('');
    } catch (err) {
      setError(t('models.fork.errorMessage'));
      console.error('Fork submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(newOpen);
      if (!newOpen) {
        setName('');
        setNotes('');
        setError(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('models.fork.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('models.fork.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                {t('models.fork.modelNameLabel')}
                <span className="text-red-500 ml-1">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('models.fork.modelNamePlaceholder')}
                disabled={isSubmitting}
                className={error ? 'border-red-500' : ''}
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">{t('models.fork.notesLabel')}</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('models.fork.notesPlaceholder')}
                disabled={isSubmitting}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t('models.fork.submitting')
                : t('models.fork.submitButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
