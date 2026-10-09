import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AutomationOverview,
  AutomationPlan,
  PlanDefinition,
  MonitorDefinition,
  MonitorRule,
  HistoryDevice,
  HistoryChart,
  HistoryPage,
  DataStats,
  ClearDataKind,
  ClearDataResult,
  DeviceInfo,
  TelemetryRecord,
  ActivityLog,
  NetworkInfo,
  NetworkHost,
  ProvisionResult,
  SystemWifiInfo,
  ServerStatus,
  RemovedDevice,
  SetupProbeResult,
  SetupCommandResponse,
} from "./types";

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function native<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri())
    throw new Error(
      "Device access requires the desktop application. Open MTTL Control on this computer to connect to physical strips.",
    );
  return invoke<T>(command, args);
}

export const api = {
  getAutomation: () => native<AutomationOverview>("get_automation"),
  saveAutomationPlan: (definition: PlanDefinition, id?: number) =>
    native<AutomationPlan>("save_automation_plan", {
      definition,
      id: id ?? null,
    }),
  runAutomationPlan: (id: number) =>
    native<void>("run_automation_plan", { id }),
  stopAutomationPlan: (id: number) =>
    native<void>("stop_automation_plan", { id }),
  stopAllAutomation: () => native<void>("stop_all_automation"),
  saveMonitorRule: (definition: MonitorDefinition, id?: number) =>
    native<MonitorRule>("save_monitor_rule", { definition, id: id ?? null }),
  deleteAutomation: (kind: "plan" | "monitor", id: number) =>
    native<void>("delete_automation", { kind, id }),
  getHistoryDevices: () => native<HistoryDevice[]>("get_history_devices"),
  getHistoryChart: (
    mac: string,
    channel: number | undefined,
    from: number,
    to: number,
  ) =>
    native<HistoryChart>("get_history_chart", {
      mac,
      channel: channel ?? null,
      from,
      to,
    }),
  getHistoryPage: (
    mac: string,
    channel: number | undefined,
    from: number,
    to: number,
    before?: number,
  ) =>
    native<HistoryPage>("get_history_page", {
      mac,
      channel: channel ?? null,
      from,
      to,
      before: before ?? null,
      limit: 100,
    }),
  getDataStats: () => native<DataStats>("get_data_stats"),
  clearData: (kind: ClearDataKind, mac?: string, channel?: number) =>
    native<ClearDataResult>("clear_data", {
      kind,
      mac: mac || null,
      channel: channel ?? null,
    }),
  removeDevice: (mac: string) => native<void>("remove_device", { mac }),
  restoreDevice: (mac: string) => native<void>("restore_device", { mac }),
  registerDevice: (mac: string, ip: string, alias: string) =>
    native<void>("register_device", { mac, ip, alias }),
  rebootDevice: (mac: string) => native<number>("reboot_device", { mac }),
  getRemovedDevices: () => native<RemovedDevice[]>("get_removed_devices"),
  getDevices: () => native<DeviceInfo[]>("get_devices"),
  getServerStatus: () => native<ServerStatus>("get_server_status"),
  updateDeviceAlias: (mac: string, alias: string, notes: string) =>
    native<void>("update_device_alias", { mac, alias, notes }),
  updateOutletMetadata: (
    mac: string,
    channel: number,
    customName: string,
    icon: string,
  ) =>
    native<void>("update_outlet_metadata", { mac, channel, customName, icon }),
  setOutletState: (mac: string, channel: number, on: boolean) =>
    native<void>("set_outlet_state", { mac, channel, on }),
  allOutletsOn: (mac: string) => native<void>("all_outlets_on", { mac }),
  allOutletsOff: (mac: string) => native<void>("all_outlets_off", { mac }),
  allStripsOff: () => native<void>("all_strips_off"),
  refreshTelemetry: (mac: string) =>
    native<void>("refresh_device_telemetry", { mac }),
  sendRawCommand: (mac: string, command: string) =>
    native<void>("send_raw_command", { mac, command }),
  getTelemetryHistory: (mac: string, channel?: number, limit?: number) =>
    native<TelemetryRecord[]>("get_telemetry_history", {
      mac,
      channel: channel ?? null,
      limit: limit ?? null,
    }),
  getActivityLogs: (limit?: number) =>
    native<ActivityLog[]>("get_activity_logs", { limit: limit ?? null }),
  getNetworkInfo: () => native<NetworkInfo>("get_network_info"),
  scanNetwork: (subnet?: string) =>
    native<NetworkHost[]>("scan_network", { subnet: subnet || null }),
  deriveWifiPassword: (ssid: string) =>
    native<string>("derive_wifi_password", { ssid }),
  provisionDevice: (
    targetIp: string,
    targetPort: number,
    controllerIp: string,
    wifiSsid: string,
    wifiPassword: string,
    controllerPort?: number,
    portStrategy?: string,
  ) =>
    native<ProvisionResult>("provision_device", {
      request: {
        targetIp,
        targetPort,
        controllerIp,
        controllerPort: controllerPort ?? 10086,
        portStrategy: portStrategy || null,
        wifiSsid,
        wifiPassword,
      },
    }),
  getSystemWifiInfo: () => native<SystemWifiInfo>("get_system_wifi_info"),
  autoProvision: (
    stripSsid: string,
    stripPassword: string,
    controllerIp: string,
    homeSsid: string,
    homePassword: string,
    targetIp: string,
    targetPort: number,
    stripBssid?: string,
    controllerPort?: number,
    portStrategy?: string,
  ) =>
    native<ProvisionResult>("auto_provision", {
      request: {
        stripSsid,
        stripPassword,
        stripBssid: stripBssid || null,
        setup: {
          controllerIp,
          controllerPort: controllerPort ?? 10086,
          portStrategy: portStrategy || null,
          wifiSsid: homeSsid,
          wifiPassword: homePassword,
          targetIp,
          targetPort,
        },
      },
    }),
  connectSystemWifi: (ssid: string, password?: string) =>
    native<string>("connect_system_wifi", { ssid, password: password || null }),
  addServerListener: (port: number) =>
    native<ServerStatus>("add_server_listener", { port }),
  probeSetupEndpoint: (
    targetIp: string,
    targetPort: number,
    controllerIp?: string,
    testPort?: number,
  ) =>
    native<SetupProbeResult>("probe_setup_endpoint", {
      targetIp,
      targetPort,
      controllerIp: controllerIp || null,
      testPort: testPort ?? null,
    }),
  sendSetupCommand: (
    targetIp: string,
    targetPort: number,
    command: string,
    timeoutMs?: number,
  ) =>
    native<SetupCommandResponse>("send_setup_command", {
      targetIp,
      targetPort,
      command,
      timeoutMs: timeoutMs ?? null,
    }),
  onEvent<T>(
    eventName: string,
    handler: (payload: T) => void,
    onError?: (error: unknown) => void,
  ): () => void {
    if (!isTauri()) return () => {};
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<T>(eventName, (event) => {
      if (!disposed) handler(event.payload);
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error) => {
        if (!disposed) onError?.(error);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  },
};
