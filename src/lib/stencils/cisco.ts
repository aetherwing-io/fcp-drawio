import type { StencilPack } from "./types.js";

function ciscoStyle(shape: string): string {
  return `sketch=0;aspect=fixed;html=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco19.${shape};`;
}

export const CISCO_PACK: StencilPack = {
  id: "cisco",
  name: "Cisco Networking",
  prefix: "mxgraph.cisco19",
  entries: [
    // Network Devices
    { id: "router", label: "Router", category: "Network Devices", baseStyle: ciscoStyle("rect_router"), defaultWidth: 50, defaultHeight: 50 },
    { id: "switch", label: "Switch", category: "Network Devices", baseStyle: ciscoStyle("rect_switch"), defaultWidth: 50, defaultHeight: 50 },
    { id: "firewall", label: "Firewall", category: "Network Devices", baseStyle: ciscoStyle("firewall"), defaultWidth: 50, defaultHeight: 50 },
    { id: "access-point", label: "Access Point", category: "Network Devices", baseStyle: ciscoStyle("access_point"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cisco-server", label: "Server", category: "Network Devices", baseStyle: ciscoStyle("rack_server"), defaultWidth: 50, defaultHeight: 50 },

    // Wireless
    { id: "wireless-router", label: "Wireless Router", category: "Wireless", baseStyle: ciscoStyle("wireless_router"), defaultWidth: 50, defaultHeight: 50 },
    { id: "wlan-controller", label: "WLAN Controller", category: "Wireless", baseStyle: ciscoStyle("wireless_lan_controller"), defaultWidth: 50, defaultHeight: 50 },

    // Security
    { id: "cisco-vpn", label: "VPN Gateway", category: "Security", baseStyle: ciscoStyle("vpn_gateway"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cisco-ips", label: "IPS", category: "Security", baseStyle: ciscoStyle("intrusion_protection_system"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cisco-asa", label: "ASA", category: "Security", baseStyle: ciscoStyle("asa_5500"), defaultWidth: 50, defaultHeight: 50 },

    // Infrastructure
    { id: "cisco-cloud", label: "Cloud", category: "Infrastructure", baseStyle: ciscoStyle("cloud"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cisco-internet", label: "Internet", category: "Infrastructure", baseStyle: ciscoStyle("internet"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cisco-storage", label: "Storage", category: "Infrastructure", baseStyle: ciscoStyle("storage"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cisco-workstation", label: "Workstation", category: "Infrastructure", baseStyle: ciscoStyle("workstation"), defaultWidth: 50, defaultHeight: 50 },
    { id: "cisco-phone", label: "IP Phone", category: "Infrastructure", baseStyle: ciscoStyle("ip_phone"), defaultWidth: 50, defaultHeight: 50 },
  ],
};
