/* Published endpoint and asynchronous prediction view contracts. */

export type Model = {
  id: string;
  name: string;
  kind: string;
  schema_id?: string;
  available: boolean;
  status: string;
};
export type Endpoint = {
  id: string;
  name: string;
  model_name: string;
  model_id: string;
  enabled: boolean;
  available: boolean;
  unavailable_reason?: string;
  path: string;
  status_url?: string;
  runtime?: {
    state: string;
    error?: string | null;
    active_requests: number;
    shared: boolean;
  } | null;
};
export type Prediction = {
  id: string;
  category?: string | null;
  status: string;
  created_at: string;
  queue_position?: number;
  error?: string;
  result_url: string;
  progress?: { phase?: string; elapsed_seconds?: number };
  result?: {
    category?: string | null;
    category_valid?: boolean;
    attributes: Record<string, string | string[]>;
    excluded_attributes: string[];
    schema_valid: boolean;
    parse_valid: boolean;
    raw: string;
    processing_seconds: number;
  };
};
