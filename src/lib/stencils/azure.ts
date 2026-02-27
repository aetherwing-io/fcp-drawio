import type { StencilPack } from "./types.js";

// Azure category colors
const COMPUTE = "#0078D4";
const NETWORKING = "#0078D4";
const STORAGE = "#0078D4";
const DATABASE = "#0078D4";
const AI = "#0078D4";
const INTEGRATION = "#0078D4";
const SECURITY = "#0078D4";
const DEVOPS = "#0078D4";
const CONTAINERS = "#0078D4";

function azureStyle(shape: string): string {
  return `sketch=0;aspect=fixed;html=1;dashed=0;fillColor=#0078D4;strokeColor=#ffffff;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.azure.${shape};`;
}

export const AZURE_PACK: StencilPack = {
  id: "azure",
  name: "Microsoft Azure",
  prefix: "mxgraph.azure",
  entries: [
    // Compute
    { id: "azure-vm", label: "Virtual Machine", category: "Compute", baseStyle: azureStyle("virtual_machine"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-functions", label: "Functions", category: "Compute", baseStyle: azureStyle("function_apps"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-app-service", label: "App Service", category: "Compute", baseStyle: azureStyle("app_services"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-logic-apps", label: "Logic Apps", category: "Compute", baseStyle: azureStyle("logic_apps"), defaultWidth: 50, defaultHeight: 50 },

    // Containers
    { id: "azure-aks", label: "AKS", category: "Containers", baseStyle: azureStyle("kubernetes_services"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-container", label: "Container Instances", category: "Containers", baseStyle: azureStyle("container_instances"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-acr", label: "Container Registry", category: "Containers", baseStyle: azureStyle("container_registries"), defaultWidth: 50, defaultHeight: 50 },

    // Networking
    { id: "azure-vnet", label: "Virtual Network", category: "Networking", baseStyle: azureStyle("virtual_network"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-lb", label: "Load Balancer", category: "Networking", baseStyle: azureStyle("load_balancers"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-appgw", label: "App Gateway", category: "Networking", baseStyle: azureStyle("application_gateways"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-dns", label: "DNS", category: "Networking", baseStyle: azureStyle("dns_zones"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-cdn", label: "CDN", category: "Networking", baseStyle: azureStyle("cdn_profiles"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-frontdoor", label: "Front Door", category: "Networking", baseStyle: azureStyle("front_doors"), defaultWidth: 50, defaultHeight: 50 },

    // Storage
    { id: "azure-storage", label: "Storage Account", category: "Storage", baseStyle: azureStyle("storage"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-blob", label: "Blob Storage", category: "Storage", baseStyle: azureStyle("storage_blob"), defaultWidth: 50, defaultHeight: 50 },

    // Database
    { id: "azure-sql", label: "SQL Database", category: "Database", baseStyle: azureStyle("sql_databases"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-cosmos", label: "Cosmos DB", category: "Database", baseStyle: azureStyle("cosmos_db"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-redis", label: "Redis Cache", category: "Database", baseStyle: azureStyle("cache_redis"), defaultWidth: 50, defaultHeight: 50 },

    // Integration
    { id: "azure-service-bus", label: "Service Bus", category: "Integration", baseStyle: azureStyle("service_bus"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-event-hub", label: "Event Hubs", category: "Integration", baseStyle: azureStyle("event_hubs"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-event-grid", label: "Event Grid", category: "Integration", baseStyle: azureStyle("event_grid_domains"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-api-mgmt", label: "API Management", category: "Integration", baseStyle: azureStyle("api_management_services"), defaultWidth: 50, defaultHeight: 50 },

    // Security
    { id: "azure-ad", label: "Entra ID", category: "Security", baseStyle: azureStyle("active_directory"), defaultWidth: 50, defaultHeight: 50 },
    { id: "azure-keyvault", label: "Key Vault", category: "Security", baseStyle: azureStyle("key_vaults"), defaultWidth: 50, defaultHeight: 50 },

    // AI
    { id: "azure-openai", label: "OpenAI Service", category: "AI", baseStyle: azureStyle("cognitive_services"), defaultWidth: 50, defaultHeight: 50 },
  ],
};
