'use client';

import { Label } from '@/components/ui/label';
import { useI18n } from '@/contexts/I18nContext';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Containers } from '@/entities/docker';

interface ContainerSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ContainerSelector({
  value,
  onValueChange,
  disabled = false,
  placeholder = ""
}: ContainerSelectorProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <Label htmlFor="container">{t('monitoring.logs.container.label')}</Label>
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {Containers.allCases().map((container) => (
              <SelectItem key={container} value={container}>
                {container}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
