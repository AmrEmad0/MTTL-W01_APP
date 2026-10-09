export interface DeviceInfo {
  mac: string;
  alias: string;
  model: string;
  firmware: string;
  ip: string;
  port: number;
  online: boolean;
  first_seen: number;
  last_seen: number;
  notes: string;
  outlets: OutletState[];
  total_power_w: number;
  total_current_a: number;
  connection_id: number;
  voltage_v?: number | null;
  rssi_dbm?: number | null;
}

export interface OutletState {
  channel: number;
  custom_name: string;
  icon: string;
  on: boolean;
  power_w: number;
  estimated_current_a: number;
  energy_kwh: number;
  secondary_energy_kwh: number;
  energy_budget_kwh: number;
  temperature_c: number;
  event_code: string;
  event_desc: string;
  overload_ok: boolean;
  overheat_ok: boolean;
  countdown_sec: number;
  standby_threshold_w: number;
  standby_cutoff_enabled: boolean;
  updated_at: number;
  telemetry_at: number;
  report_revision: number;
}

export interface TelemetryRecord {
  id: number;
  sample_id: number | null;
  raw_frame: string | null;
  energy_budget_kwh: number | null;
  overload_ok: boolean | null;
  overheat_ok: boolean | null;
  countdown_sec: number | null;
  standby_threshold_w: number | null;
  standby_cutoff_enabled: boolean | null;
  mac: string;
  channel: number;
  relay_on: boolean;
  power_w: number;
  energy_kwh: number;
  secondary_energy_kwh: number;
  temperature_c: number;
  event_code: string;
  recorded_at: number;
}

export interface ActivityLog {
  id: number;
  mac: string;
  event_type: string;
  details: string;
  timestamp: number;
}

export interface NetworkHost {
  ip: string;
  mac?: string;
  vendor?: string;
  hostname?: string;
  is_mttl: boolean;
  setup_port_open: boolean;
  runtime_port_open: boolean;
  ping_ms?: number;
}

export interface NetworkInfo {
  local_ip: string;
  subnet: string;
  default_gateway: string;
  interfaces: {
    name: string;
    ip: string;
    netmask: string;
  }[];
}

export interface ProvisionStep {
  step: number;
  title: string;
  success: boolean;
  message: string;
}

export interface ProvisionResult {
  success: boolean;
  logs: ProvisionStep[];
  message: string;
  settings_applied: boolean;
  network_restored: boolean | null;
}

export interface RawLogEvent {
  timestamp: string;
  direction: string;
  mac: string;
  content: string;
  raw_hex?: string;
  byte_len?: number;
  is_hex: boolean;
}

export interface DetectedStripAp {
  ssid: string;
  bssid: string;
  derived_password: string;
}

export interface SystemWifiInfo {
  active_ssid?: string;
  active_psk?: string;
  detected_strip_aps: DetectedStripAp[];
  available_ssids: string[];
}

export interface ServerStatus {
  running: boolean;
  port: number;
  ports?: number[];
  error: string | null;
}

export interface SetupProbeItem {
  command: string;
  label: string;
  response: string;
  response_hex: string;
  status: string; // "ACK" | "EMPTY" | "UNRECOGNIZED" | "TIMEOUT" | "CLOSED" | "ERROR"
  latency_ms: number;
}

export interface SetupProbeResult {
  target: string;
  reachable: boolean;
  tests: SetupProbeItem[];
  summary: string;
}

export interface SetupCommandResponse {
  command: string;
  raw_response: string;
  raw_hex: string;
  byte_count: number;
  latency_ms: number;
  success: boolean;
  error?: string | null;
}

export interface RemovedDevice {
  hidden?: boolean;
  mac: string;
  alias: string;
  ip: string;
  removed_at: number;
}
export interface ProvisionTarget {
  id: string;
  mode: "auto" | "manual";
  name: string;
  mac?: string;
  ssid?: string;
  bssid?: string;
  password?: string;
  ip: string;
  port: number;
  controllerPort?: number;
  portStrategy?: string;
}

export interface HistoryDevice {
  mac: string;
  alias: string;
  notes: string;
  removed: boolean;
  outlets: { channel: number; name: string; icon: string }[];
}
export interface HistorySummary {
  observed_seconds: number;
  relay_on_seconds: number;
  standby_seconds: number;
  relay_changes: number;
  minimum_power_w: number | null;
  power_stddev_w: number | null;
  record_count: number;
  sample_count: number;
  observed_energy_kwh: number | null;
  average_power_w: number | null;
  peak_power_w: number | null;
  max_temperature_c: number | null;
  counter_resets: number;
  gap_intervals: number;
  first_at: number | null;
  last_at: number | null;
}
export interface HistoryPoint {
  timestamp: number;
  average_power_w: number | null;
  peak_power_w: number | null;
  temperature_c: number | null;
  energy_kwh: number | null;
  samples: number;
}
export interface OutletUsage {
  channel: number;
  name: string;
  observed_energy_kwh: number | null;
  average_power_w: number | null;
  peak_power_w: number | null;
  records: number;
}
export interface HistoryChart {
  bucket_seconds: number;
  summary: HistorySummary;
  points: HistoryPoint[];
  outlets: OutletUsage[];
}
export interface HistoryPage {
  records: TelemetryRecord[];
  next_before: number | null;
}
export interface DataStats {
  devices: number;
  removed_visible: number;
  removed_hidden: number;
  telemetry: number;
  frames: number;
  activity: number;
}
export type ClearDataKind =
  "removed_list" | "activity" | "telemetry" | "recorded_data" | "database";
export interface ClearDataResult {
  telemetry_deleted: number;
  activity_deleted: number;
  removed_hidden: number;
  devices_deleted: number;
}

export interface OutletTarget {
  mac: string;
  channel: number;
}
export interface ScenarioStep {
  on: boolean;
  duration_sec: number;
}
export type ScheduleTrigger =
  | { kind: "manual" }
  | { kind: "once"; at: number }
  | { kind: "weekly"; time: string; weekdays: number[] };
export interface PlanDefinition {
  name: string;
  targets: OutletTarget[];
  steps: ScenarioStep[];
  repetitions: number;
  trigger: ScheduleTrigger;
  enabled: boolean;
}
export interface AutomationPlan {
  id: number;
  definition: PlanDefinition;
  next_run_at: number | null;
  status: string;
  current_step: number;
  completed_cycles: number;
  started_at: number | null;
  finished_at: number | null;
  message: string;
}
export interface MonitorDefinition {
  name: string;
  target: OutletTarget;
  metric: "power" | "temperature";
  comparison: "above" | "below";
  threshold: number;
  duration_sec: number;
  action: "alert" | "off";
  enabled: boolean;
}
export interface MonitorRule {
  id: number;
  definition: MonitorDefinition;
  status: string;
  last_triggered_at: number | null;
  message: string;
}
export interface AutomationOverview {
  plans: AutomationPlan[];
  monitors: MonitorRule[];
}
