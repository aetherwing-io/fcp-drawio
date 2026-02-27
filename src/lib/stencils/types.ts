export interface StencilEntry {
  id: string;              // "lambda", "s3", "cloud-run"
  label: string;           // "Lambda", "S3", "Cloud Run"
  category: string;        // "compute", "storage", "networking"
  baseStyle: string;       // full draw.io style string
  defaultWidth: number;    // typically 60
  defaultHeight: number;   // typically 60
}

export interface StencilPack {
  id: string;              // "aws", "azure", "gcp"
  name: string;            // "Amazon Web Services"
  prefix: string;          // "mxgraph.aws4" (for deserialize detection)
  entries: StencilEntry[];
}
