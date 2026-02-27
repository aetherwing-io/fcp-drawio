import type { StencilPack } from "./types.js";

function k8sStyle(shape: string): string {
  return `sketch=0;aspect=fixed;html=1;dashed=0;fillColor=#326CE5;strokeColor=#ffffff;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.kubernetes.${shape};`;
}

export const K8S_PACK: StencilPack = {
  id: "k8s",
  name: "Kubernetes",
  prefix: "mxgraph.kubernetes",
  entries: [
    // Workloads
    { id: "pod", label: "Pod", category: "Workloads", baseStyle: k8sStyle("pod"), defaultWidth: 50, defaultHeight: 50 },
    { id: "deployment", label: "Deployment", category: "Workloads", baseStyle: k8sStyle("deploy"), defaultWidth: 50, defaultHeight: 50 },
    { id: "statefulset", label: "StatefulSet", category: "Workloads", baseStyle: k8sStyle("stateful_set"), defaultWidth: 50, defaultHeight: 50 },
    { id: "daemonset", label: "DaemonSet", category: "Workloads", baseStyle: k8sStyle("ds"), defaultWidth: 50, defaultHeight: 50 },
    { id: "job", label: "Job", category: "Workloads", baseStyle: k8sStyle("job"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cronjob", label: "CronJob", category: "Workloads", baseStyle: k8sStyle("cronjob"), defaultWidth: 50, defaultHeight: 50 },
    { id: "replicaset", label: "ReplicaSet", category: "Workloads", baseStyle: k8sStyle("rs"), defaultWidth: 50, defaultHeight: 50 },

    // Networking
    { id: "k8s-service", label: "Service", category: "Networking", baseStyle: k8sStyle("svc"), defaultWidth: 50, defaultHeight: 50 },
    { id: "ingress", label: "Ingress", category: "Networking", baseStyle: k8sStyle("ing"), defaultWidth: 50, defaultHeight: 50 },
    { id: "endpoint", label: "Endpoint", category: "Networking", baseStyle: k8sStyle("ep"), defaultWidth: 50, defaultHeight: 50 },
    { id: "netpol", label: "NetworkPolicy", category: "Networking", baseStyle: k8sStyle("netpol"), defaultWidth: 50, defaultHeight: 50 },

    // Config/Storage
    { id: "configmap", label: "ConfigMap", category: "Config", baseStyle: k8sStyle("cm"), defaultWidth: 50, defaultHeight: 50 },
    { id: "secret", label: "Secret", category: "Config", baseStyle: k8sStyle("secret"), defaultWidth: 50, defaultHeight: 50 },
    { id: "pv", label: "PersistentVolume", category: "Storage", baseStyle: k8sStyle("pv"), defaultWidth: 50, defaultHeight: 50 },
    { id: "pvc", label: "PersistentVolumeClaim", category: "Storage", baseStyle: k8sStyle("pvc"), defaultWidth: 50, defaultHeight: 50 },

    // Cluster
    { id: "node", label: "Node", category: "Cluster", baseStyle: k8sStyle("node"), defaultWidth: 50, defaultHeight: 50 },
    { id: "namespace", label: "Namespace", category: "Cluster", baseStyle: k8sStyle("ns"), defaultWidth: 50, defaultHeight: 50 },
  ],
};
