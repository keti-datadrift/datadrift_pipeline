import type { DriftComposite, DriftField } from "@/lib/drift-types";

export type Dataset = {
  created_at?: string;
  reviewed_count?: number;
  unlabeled_count?: number;
  labeled_count?: number;
  labeling_job_id?: string;
  labeling_model_id?: string;
  schema_id?: string;
  id: string;
  name: string;
  workspace_id: string;
  count: number;
  splits: Record<string, number>;
  provenance: string;
  fingerprint: string;
  kind: string;
  parent_ids: string[];
  selection?: {
    scope: string;
    available_count: number;
    selected_count: number;
    duplicate_count: number;
    by_source: Record<string, number>;
    reference_name?: string;
    before_js?: number;
    after_js?: number;
    mix?: {
      dataset_id: string;
      workspace_id: string;
      name: string;
      target_ratio: number;
      actual_ratio: number;
      selected_count: number;
      available_count: number;
    }[];
  };
};
export type Workspace = {
  labeling_model_id?: string | null;
  labeling_model_name?: string | null;
  id: string;
  name: string;
  description: string;
  datasets: Dataset[];
};
export type Model = {
  schema_id?: string;
  id: string;
  name: string;
  family: string;
  kind: string;
  status: string;
  available: boolean;
  training_job_id?: string;
  dataset_id?: string;
  parent_id?: string;
};
export type Run = {
  dataset_name?: string;
  reference_name?: string;
  dataset_workspace_id?: string;
  reference_workspace_id?: string;
  id: string;
  status: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  request: {
    kind: string;
    dataset_id: string;
    model_id?: string;
    reference_id?: string;
    max_steps: number;
    split: string;
  };
  progress: {
    phase?: string;
    step?: number;
    total?: number;
    loss?: number;
    history?: { step: number; loss: number }[];
    elapsed_seconds?: number;
    batch_size?: number;
  };
  error?: string;
  result?: DriftComposite & {
    dataset_id?: string;
    model_id?: string;
    count?: number;
    macro_attribute_accuracy?: number;
    exact_match?: number;
    parse_failures?: number;
    schema_failures?: number;
    fields?:
      Record<string, { accuracy: number | null; count: number }> | DriftField[];
    predictions?: {
      sample_id: string;
      raw: string;
      target: Record<string, unknown>;
      prediction: Record<string, unknown> | null;
      schema_valid?: boolean;
    }[];
    note?: string;
    detected?: boolean;
    image_histogram_js?: number;
    reference_count?: number;
    current_count?: number;
    threshold?: number;
    optimizer_steps?: number;
    training_sample_ids?: string[];
    loss?: number;
    policy_changed?: boolean;
  };
};
