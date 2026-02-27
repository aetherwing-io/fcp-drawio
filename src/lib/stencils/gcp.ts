import type { StencilPack } from "./types.js";

function gcpStyle(shape: string): string {
  return `sketch=0;aspect=fixed;html=1;dashed=0;fillColor=#4285F4;strokeColor=#ffffff;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.gcp2.${shape};`;
}

export const GCP_PACK: StencilPack = {
  id: "gcp",
  name: "Google Cloud Platform",
  prefix: "mxgraph.gcp2",
  entries: [
    // Compute
    { id: "cloud-run", label: "Cloud Run", category: "Compute", baseStyle: gcpStyle("cloud_run"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cloud-functions", label: "Cloud Functions", category: "Compute", baseStyle: gcpStyle("cloud_functions"), defaultWidth: 50, defaultHeight: 50 },
    { id: "compute-engine", label: "Compute Engine", category: "Compute", baseStyle: gcpStyle("compute_engine"), defaultWidth: 50, defaultHeight: 50 },
    { id: "app-engine", label: "App Engine", category: "Compute", baseStyle: gcpStyle("app_engine"), defaultWidth: 50, defaultHeight: 50 },
    { id: "gke", label: "GKE", category: "Compute", baseStyle: gcpStyle("google_kubernetes_engine"), defaultWidth: 50, defaultHeight: 50 },

    // Storage
    { id: "cloud-storage", label: "Cloud Storage", category: "Storage", baseStyle: gcpStyle("cloud_storage"), defaultWidth: 50, defaultHeight: 50 },
    { id: "persistent-disk", label: "Persistent Disk", category: "Storage", baseStyle: gcpStyle("persistent_disk"), defaultWidth: 50, defaultHeight: 50 },
    { id: "filestore", label: "Filestore", category: "Storage", baseStyle: gcpStyle("filestore"), defaultWidth: 50, defaultHeight: 50 },

    // Database
    { id: "cloud-sql", label: "Cloud SQL", category: "Database", baseStyle: gcpStyle("cloud_sql"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cloud-spanner", label: "Cloud Spanner", category: "Database", baseStyle: gcpStyle("cloud_spanner"), defaultWidth: 50, defaultHeight: 50 },
    { id: "bigtable", label: "Bigtable", category: "Database", baseStyle: gcpStyle("cloud_bigtable"), defaultWidth: 50, defaultHeight: 50 },
    { id: "firestore", label: "Firestore", category: "Database", baseStyle: gcpStyle("cloud_firestore"), defaultWidth: 50, defaultHeight: 50 },
    { id: "memorystore", label: "Memorystore", category: "Database", baseStyle: gcpStyle("cloud_memorystore"), defaultWidth: 50, defaultHeight: 50 },

    // Networking
    { id: "cloud-load-balancing", label: "Load Balancing", category: "Networking", baseStyle: gcpStyle("cloud_load_balancing"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cloud-cdn", label: "Cloud CDN", category: "Networking", baseStyle: gcpStyle("cloud_cdn"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cloud-dns", label: "Cloud DNS", category: "Networking", baseStyle: gcpStyle("cloud_dns"), defaultWidth: 50, defaultHeight: 50 },

    // Integration
    { id: "pubsub", label: "Pub/Sub", category: "Integration", baseStyle: gcpStyle("cloud_pubsub"), defaultWidth: 50, defaultHeight: 50 },

    // Analytics
    { id: "bigquery", label: "BigQuery", category: "Analytics", baseStyle: gcpStyle("bigquery"), defaultWidth: 50, defaultHeight: 50 },
    { id: "dataflow", label: "Dataflow", category: "Analytics", baseStyle: gcpStyle("cloud_dataflow"), defaultWidth: 50, defaultHeight: 50 },

    // AI
    { id: "vertex-ai", label: "Vertex AI", category: "AI", baseStyle: gcpStyle("vertexai"), defaultWidth: 50, defaultHeight: 50 },
  ],
};
