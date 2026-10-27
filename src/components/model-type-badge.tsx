"use client";

import { ModelType } from '@/entities/ml-model';
import { Badge } from './ui/badge';
import { ModelTypeColors } from './colors/model-type';
import { useI18n } from '@/contexts/I18nContext';

type HoverStyle = 'plain' | 'highlight';

export default function ModelTypeBadge({
  type,
  hover = 'highlight',
}: {
  type: ModelType;
  hover?: HoverStyle;
}) {
  const { t } = useI18n();
  const style = ModelTypeColors[type] ?? {
    background: 'bg-gray-500/90',
    text: 'text-white',
    bgHover: 'hover:bg-gray-500/60',
  };
  return (
    <Badge
      className={`text-xs font-medium ${style.background} ${style.text} ${hover === 'highlight' ? style.bgHover : ''}`}
    >
      {t(`modelType.${type}`)}
    </Badge>
  );
}
