import type { StencilPack } from "./types.js";

function ibmStyle(shape: string): string {
  return `sketch=0;aspect=fixed;html=1;dashed=0;fillColor=#4376BB;strokeColor=#ffffff;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.ibm.${shape};`;
}

export const IBM_PACK: StencilPack = {
  id: "ibm",
  name: "IBM Cloud",
  prefix: "mxgraph.ibm",
  entries: [
    // Compute
    { id: "ibm-vm", label: "Virtual Server", category: "Compute", baseStyle: ibmStyle("virtual_server_classic"), defaultWidth: 50, defaultHeight: 50 },
    { id: "ibm-bare-metal", label: "Bare Metal", category: "Compute", baseStyle: ibmStyle("bare_metal_server"), defaultWidth: 50, defaultHeight: 50 },
    { id: "ibm-functions", label: "Cloud Functions", category: "Compute", baseStyle: ibmStyle("cloud_functions"), defaultWidth: 50, defaultHeight: 50 },
    { id: "ibm-code-engine", label: "Code Engine", category: "Compute", baseStyle: ibmStyle("code_engine"), defaultWidth: 50, defaultHeight: 50 },

    // Containers
    { id: "ibm-k8s", label: "Kubernetes Service", category: "Containers", baseStyle: ibmStyle("kubernetes_service"), defaultWidth: 50, defaultHeight: 50 },
    { id: "ibm-openshift", label: "OpenShift", category: "Containers", baseStyle: ibmStyle("openshift"), defaultWidth: 50, defaultHeight: 50 },
    { id: "ibm-registry", label: "Container Registry", category: "Containers", baseStyle: ibmStyle("container_registry"), defaultWidth: 50, defaultHeight: 50 },

    // Networking
    { id: "ibm-vpc", label: "VPC", category: "Networking", baseStyle: ibmStyle("vpc"), defaultWidth: 50, defaultHeight: 50 },
    { id: "ibm-lb", label: "Load Balancer", category: "Networking", baseStyle: ibmStyle("load_balancer_classic"), defaultWidth: 50, defaultHeight: 50 },
    { id: "ibm-dns", label: "DNS Services", category: "Networking", baseStyle: ibmStyle("dns_services"), defaultWidth: 50, defaultHeight: 50 },

    // Storage
    { id: "ibm-cos", label: "Object Storage", category: "Storage", baseStyle: ibmStyle("cloud_object_storage"), defaultWidth: 50, defaultHeight: 50 },
    { id: "ibm-block", label: "Block Storage", category: "Storage", baseStyle: ibmStyle("block_storage"), defaultWidth: 50, defaultHeight: 50 },

    // Database
    { id: "ibm-db2", label: "Db2", category: "Database", baseStyle: ibmStyle("db2"), defaultWidth: 50, defaultHeight: 50 },
    { id: "ibm-cloudant", label: "Cloudant", category: "Database", baseStyle: ibmStyle("cloudant"), defaultWidth: 50, defaultHeight: 50 },

    // AI
    { id: "ibm-watson", label: "Watson", category: "AI", baseStyle: ibmStyle("watson"), defaultWidth: 50, defaultHeight: 50 },
  ],
};
