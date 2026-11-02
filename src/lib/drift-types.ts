/* Result contracts for current composite and historical drift analyses. */

export type DriftField = {
  status?: string;
  adjusted_p_value?: number;
  category_adjusted_p_value?: number;
  category_detected?: boolean;
  reference_scored?: number;
  current_scored?: number;
  q_value?: number;
  category_adjusted_js?: number;
  category_adjusted_q?: number;
  field: string;
  js_divergence: number;
  detected: boolean;
  reference: Record<string, number>;
  current: Record<string, number>;
};

export type DriftSignal = {
  kind: string;
  status: string;
  detected: boolean;
  tested_count: number;
  detected_count: number;
};
export type DriftComposite = {
  method_version?: string;
  decision?: string;
  complete?: boolean;
  detected?: boolean;
  signals?: DriftSignal[];
  alpha?: number;
  analysis_reference_count?: number;
  analysis_current_count?: number;
  category_mix?: { js_divergence?: number; adjusted_p_value?: number };
  image_embeddings?: {
    status: string;
    statistic?: number;
    adjusted_p_value?: number;
    reference_count: number;
    current_count: number;
    encoder?: string;
    reason?: string;
    cache_hits?: number;
  };
  quality?: {
    shared_images: number;
    reference_duplicates: number;
    current_duplicates: number;
    identical_inputs: boolean;
  };
};
