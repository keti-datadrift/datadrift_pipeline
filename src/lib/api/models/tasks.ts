export interface TaskResponse {
  id: number;
  inner_id: number;
  cancelled_annotations: number;
  total_annotations: number;
  total_predictions: number;
  data: {
    image: string;
  };
  created_at: string;
  updated_at: string;
  is_labeled: boolean;
  overlap: number;
  comment_count: number;
  unresolved_comment_count: number;
  project: number;
}

export interface GetTasksResponse {
  total_annotations: number;
  total_predictions: number;
  total: number;
  tasks: TaskResponse[];
}
