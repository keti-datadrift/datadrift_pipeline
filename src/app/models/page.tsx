'use client';

import { StatCard } from '@/components/stat-card';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ApiModelResponse, getModels } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils/time';
import { Activity, CreditCard, DollarSign, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { columns, Model } from './columns';
import { DataTable } from './data-table';

/**
 * Transform API model to UI Model
 */
function transformResponseToEntity(response: ApiModelResponse): Model {
  return {
    id: response.id.toString(),
    name: response.name,
    type: response.type,
    version: response.version,
    updatedAt: formatRelativeTime(response.updated_at),
  };
}

async function getModelsData(): Promise<Model[]> {
  try {
    const response = await getModels();
    return response.items.map(transformResponseToEntity);
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return [];
  }
}

export default function ModelsPage() {
  const [data, setData] = useState<Model[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const modelsData = await getModelsData();
        setData(modelsData);
      } catch (error) {
        console.error('Failed to fetch models:', error);
      }
    }

    fetchData();
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Models</h1>
        <p className="text-gray-600 text-sm">Models</p>
      </div>

      {/* Stats */}
      <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4 mb-8">
        <StatCard
          title="OCR"
          description="Number of OCR models"
          value={data.filter((model) => model.type.startsWith('ocr')).length}
          icon={Users}
        />
        <StatCard
          title="Layout Detection"
          description="Number of Layout Detection models"
          value={data.filter((model) => model.type === 'layout').length}
          icon={Activity}
        />
        <StatCard
          title="Extraction"
          description="Number of Extraction models"
          value={data.filter((model) => model.type === 'tabrec').length}
          icon={CreditCard}
        />
      </div>

      {/* Models Table */}
      <div className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Model Overview</CardTitle>
            <CardDescription>List of all models</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable data={data} columns={columns} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
