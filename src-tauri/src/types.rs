use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub mac: String,
    pub alias: String,
    pub model: String,
    pub firmware: String,
    pub ip: String,
    pub port: u16,
    pub online: bool,
    pub first_seen: i64,
    pub last_seen: i64,
    pub notes: String,
    pub outlets: Vec<OutletState>,
    pub total_power_w: f64,
    pub total_current_a: f64,
    pub connection_id: u64,
    pub voltage_v: Option<f64>,
    pub rssi_dbm: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutletState {
    pub channel: u8,
    pub custom_name: String,
    pub icon: String,
    pub on: bool,
    pub power_w: f64,
    pub estimated_current_a: f64,
    pub energy_kwh: f64,
    pub secondary_energy_kwh: f64,
    pub energy_budget_kwh: f64,
    pub temperature_c: i32,
    pub event_code: String,
    pub event_desc: String,
    pub overload_ok: bool,
    pub overheat_ok: bool,
    pub countdown_sec: u32,
    pub standby_threshold_w: u32,
    pub standby_cutoff_enabled: bool,
    pub updated_at: i64,
    pub telemetry_at: i64,
    pub report_revision: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryRecord {
    pub id: i64,
    pub sample_id: Option<i64>,
    pub raw_frame: Option<String>,
    pub energy_budget_kwh: Option<f64>,
    pub overload_ok: Option<bool>,
    pub overheat_ok: Option<bool>,
    pub countdown_sec: Option<u32>,
    pub standby_threshold_w: Option<u32>,
    pub standby_cutoff_enabled: Option<bool>,
    pub mac: String,
    pub channel: u8,
    pub relay_on: bool,
    pub power_w: f64,
    pub energy_kwh: f64,
    pub secondary_energy_kwh: f64,
    pub temperature_c: i32,
    pub event_code: String,
    pub recorded_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityLog {
    pub id: i64,
    pub mac: String,
    pub event_type: String,
    pub details: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkHost {
    pub ip: String,
    pub mac: Option<String>,
    pub vendor: Option<String>,
    pub hostname: Option<String>,
    pub is_mttl: bool,
    pub setup_port_open: bool,   // 30300
    pub runtime_port_open: bool, // 10086
    pub ping_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInfo {
    pub local_ip: String,
    pub subnet: String,
    pub default_gateway: String,
    pub interfaces: Vec<NetworkInterfaceInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInterfaceInfo {
    pub name: String,
    pub ip: String,
    pub netmask: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvisionStep {
    pub step: u8,
    pub title: String,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvisionResult {
    pub success: bool,
    pub settings_applied: bool,
    pub network_restored: Option<bool>,
    pub logs: Vec<ProvisionStep>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawLogEvent {
    pub timestamp: String,
    pub direction: String, // "RX" or "TX"
    pub mac: String,
    pub content: String,
    #[serde(default)]
    pub raw_hex: Option<String>,
    #[serde(default)]
    pub byte_len: usize,
    pub is_hex: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemWifiInfo {
    pub active_ssid: Option<String>,
    pub active_psk: Option<String>,
    pub detected_strip_aps: Vec<DetectedStripAp>,
    pub available_ssids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedStripAp {
    pub ssid: String,
    pub bssid: String,
    pub derived_password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    #[serde(default)]
    pub ports: Vec<u16>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupProbeResult {
    pub target: String,
    pub reachable: bool,
    pub tests: Vec<SetupProbeItem>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupProbeItem {
    pub command: String,
    pub label: String,
    pub response: String,
    pub response_hex: String,
    pub status: String, // "ACK" | "EMPTY" | "UNRECOGNIZED" | "TIMEOUT" | "CLOSED" | "ERROR"
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupCommandResponse {
    pub command: String,
    pub raw_response: String,
    pub raw_hex: String,
    pub byte_count: usize,
    pub latency_ms: u64,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemovedDevice {
    pub hidden: bool,
    pub mac: String,
    pub alias: String,
    pub ip: String,
    pub removed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryDevice {
    pub notes: String,
    pub mac: String,
    pub alias: String,
    pub removed: bool,
    pub outlets: Vec<OutletUsageName>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutletUsageName {
    pub icon: String,
    pub channel: u8,
    pub name: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistorySummary {
    pub observed_seconds: u64,
    pub relay_on_seconds: u64,
    pub standby_seconds: u64,
    pub relay_changes: u64,
    pub minimum_power_w: Option<f64>,
    pub power_stddev_w: Option<f64>,
    pub record_count: u64,
    pub sample_count: u64,
    pub observed_energy_kwh: Option<f64>,
    pub average_power_w: Option<f64>,
    pub peak_power_w: Option<f64>,
    pub max_temperature_c: Option<i32>,
    pub counter_resets: u64,
    pub gap_intervals: u64,
    pub first_at: Option<i64>,
    pub last_at: Option<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryPoint {
    pub timestamp: i64,
    pub average_power_w: Option<f64>,
    pub peak_power_w: Option<f64>,
    pub temperature_c: Option<i32>,
    pub energy_kwh: Option<f64>,
    pub samples: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutletUsage {
    pub channel: u8,
    pub name: String,
    pub observed_energy_kwh: Option<f64>,
    pub average_power_w: Option<f64>,
    pub peak_power_w: Option<f64>,
    pub records: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryChart {
    pub bucket_seconds: i64,
    pub summary: HistorySummary,
    pub points: Vec<HistoryPoint>,
    pub outlets: Vec<OutletUsage>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryPage {
    pub records: Vec<TelemetryRecord>,
    pub next_before: Option<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataStats {
    pub devices: u64,
    pub removed_visible: u64,
    pub removed_hidden: u64,
    pub telemetry: u64,
    pub frames: u64,
    pub activity: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClearDataKind {
    RemovedList,
    Activity,
    Telemetry,
    RecordedData,
    Database,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClearDataResult {
    pub telemetry_deleted: usize,
    pub activity_deleted: usize,
    pub removed_hidden: usize,
    pub devices_deleted: usize,
}
