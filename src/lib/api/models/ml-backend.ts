export interface MLBackendResponse {
  id: number;
  state: string;
  readable_state: string;
  is_interactive: boolean;
  url: string;
  error_message: string;
  title: string;
  auth_method: string;
  basic_auth_user: string;
  basic_auth_pass_is_set: boolean;
  description: string;
  extra_params: string;
  model_version: string;
  timeout: number;
  created_at: string;
  updated_at: string;
  auto_update: boolean;
  project: number;
}

export type MLBackendsResponse = MLBackendResponse[];
