import { Project } from '@/entities/labelstudio';
import { ModelType } from '@/entities/ml-model';
import { MLModelType } from './ml-models';
import { PaginatedLabelStudioResponse } from './pagination';

export interface ProjectResponse {
  id: number;
  title: string;
  color: string;
  ml_model_type: MLModelType;
  finished_task_number: number;
  task_number: number;
  total_annotations_number: number;
  total_predictions_number: number;
}

export type GetProjectsResponse = PaginatedLabelStudioResponse<ProjectResponse>;

export namespace ProjectResponse {
  export function toEntity(response: ProjectResponse): Project {
    return {
      id: response.id.toString(),
      title: response.title,
      color: response.color,
      type: ModelType.fromString(response.ml_model_type),
      finishedTasksCount: response.finished_task_number,
      totalTasksCount: response.task_number,
      annotationsCount: response.total_annotations_number,
      predictionsCount: response.total_predictions_number,
    };
  }
}

/**
 * Update Project 요청 스키마
 */
export interface UpdateProjectRequest {
  title?: string;
  description?: string;
  label_config?: string;
  expert_instruction?: string;
  show_instruction?: boolean;
  show_skip_button?: boolean;
  enable_empty_annotation?: boolean;
  show_annotation_history?: boolean;
  reveal_preannotations_interactively?: boolean;
  show_collab_predictions?: boolean;
  maximum_annotations?: number;
  color?: string;
  control_weights?: Record<string, any>;
  workspace?: number;
  model_version?: string;
  ml_model_type?: string;
}

export namespace UpdateProjectRequest {
  export function fromEntity(entity: Project): UpdateProjectRequest {
    return {
      title: entity.title,
      ml_model_type: entity.type.toString(),
    };
  }
}

/**
 * Update Project 응답 스키마
 *
 * {@link UpdateProjectRequest}와 동일한 스키마 사용
 * */
export interface UpdateProjectResponse extends UpdateProjectRequest {}

/**
 * Upload tasks options for multipart file upload
 */
export interface UploadTasksOptions {
  /** Field name for the files in the form data (defaults to 'files') */
  fieldName?: string;
  /** Additional form data to include with the upload */
  additionalData?: Record<string, string | number | boolean>;
}
