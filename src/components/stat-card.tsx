import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import React from 'react';

interface ModelStatCardProps {
  title: string;
  description: string;
  value: number;
  icon: React.ElementType;
}

export function StatCard({ title, description, value, icon: Icon }: ModelStatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row justify-between">
        <CardTitle>{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
