use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, State};

use crate::automation::{
    AutomationEngine, AutomationOverview, AutomationPlan, MonitorDefinition, MonitorRule,
    PlanDefinition,
};
use crate::db::Database;
use crate::mttl::{derive_ap_password, normalize_mac};
use crate::provision::{
    AutoSetupRequest, SetupRequest, auto_provision_pipeline, detect_system_wifi,
    probe_setup_endpoint as probe_setup_impl, provision_strip,
    send_setup_command as send_setup_impl,
};
use crate::scanner::{get_local_network_info, scan_subnet};
use crate::server::ServerState;
use crate::types::*;

pub struct AppState {
    pub db: Arc<Database>,
    pub server: Arc<ServerState>,
    pub automation: Arc<AutomationEngine>,
    pub provision_gate: tokio::sync::Mutex<()>,
}

#[tauri::command]
pub async fn get_devices(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, String> {
    let _status_guard = state.server.status_gate.lock().await;
    let mut devices = state.db.get_devices().map_err(|e| e.to_string())?;

    // Cross-reference live online status from active socket sessions
    for dev in &mut devices {
        let session = state.server.sessions.read().await.get(&dev.mac).cloned();
        dev.online = session.is_some();
        if let Some(session) = session {
            dev.connection_id = session.connection_id;
            let reports = session.reports.read().await;
            for outlet in &mut dev.outlets {
                outlet.report_revision = *reports.get(&outlet.channel).unwrap_or(&0);
                // Cached telemetry from a previous socket is not a live report.
                if !session.telemetry_received.load(Ordering::Acquire) {
                    outlet.telemetry_at = 0;
                }
            }
            let live_vol = *session.voltage_v.read().await;
            if live_vol.is_some() {
                dev.voltage_v = live_vol;
            }
            let live_rssi = *session.rssi_dbm.read().await;
            if live_rssi.is_some() {
                dev.rssi_dbm = live_rssi;
            }
            if let Some(vol) = dev.voltage_v
                && vol > 50.0
            {
                dev.total_current_a = (dev.total_power_w / vol * 1000.0).round() / 1000.0;
            }
        }
    }

    Ok(devices)
}

#[tauri::command]
pub async fn remove_device(
    mac: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut automation = state.automation.state.lock().await;
    automation.pause_targets(Some(&mac))?;
    state.server.remove_device(&mac).await?;
    use tauri::Emitter;
    let _ = app.emit("device-removed", normalize_mac(&mac));
    Ok(())
}

#[tauri::command]
pub async fn get_removed_devices(state: State<'_, AppState>) -> Result<Vec<RemovedDevice>, String> {
    state
        .db
        .get_removed_devices()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn restore_device(mac: String, state: State<'_, AppState>) -> Result<(), String> {
    let _guard = state.server.status_gate.lock().await;
    let mac = normalize_mac(&mac);
    state
        .db
        .restore_device(&mac)
        .map_err(|error| error.to_string())?;
    let _ = state.db.log_activity(
        &mac,
        "device_restored",
        "Added back; awaiting physical strip connection",
    );
    Ok(())
}

#[tauri::command]
pub async fn register_device(
    mac: String,
    ip: String,
    alias: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mac = normalize_mac(&mac);
    if mac.len() != 12
        || !mac.chars().all(|c| c.is_ascii_hexdigit())
        || mac == "000000000000"
        || mac == "FFFFFFFFFFFF"
    {
        return Err("Enter a valid 12-digit device MAC address".into());
    }
    let address = ip
        .trim()
        .parse::<std::net::Ipv4Addr>()
        .map_err(|_| "Enter a valid device IPv4 address")?;
    if address.is_loopback()
        || address.is_unspecified()
        || address.is_multicast()
        || address.is_broadcast()
    {
        return Err("Enter a reachable device IPv4 address".into());
    }
    if alias.trim().is_empty() || alias.len() > 160 {
        return Err("Enter a strip name of up to 160 characters".into());
    }
    let _guard = state.server.status_gate.lock().await;
    state
        .db
        .register_device(&mac, &address.to_string(), alias.trim())
        .map_err(|error| error.to_string())?;
    let _ = state.db.log_activity(
        &mac,
        "device_added",
        "Registered manually; awaiting a physical runtime connection",
    );
    Ok(())
}

#[tauri::command]
pub async fn reboot_device(mac: String, state: State<'_, AppState>) -> Result<u64, String> {
    let automation = state.automation.state.lock().await;
    automation.ensure_available(&mac, None)?;
    state.server.reboot_device(&mac).await
}

#[tauri::command]
pub async fn update_device_alias(
    mac: String,
    alias: String,
    notes: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if alias.trim().is_empty() || alias.chars().count() > 80 || notes.chars().count() > 500 {
        return Err("Enter a strip name of 1–80 characters and notes up to 500 characters".into());
    }
    let mac = normalize_mac(&mac);
    state
        .db
        .update_device_alias(&mac, alias.trim(), &notes)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_outlet_metadata(
    mac: String,
    channel: u8,
    custom_name: String,
    icon: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !(1..=4).contains(&channel)
        || custom_name.trim().is_empty()
        || custom_name.chars().count() > 80
        || icon.len() > 64
    {
        return Err("Select outlet 1–4 and enter a name of 1–80 characters".into());
    }
    let mac = normalize_mac(&mac);
    state
        .db
        .update_outlet_metadata(&mac, channel, custom_name.trim(), &icon)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_outlet_state(
    mac: String,
    channel: u8,
    on: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let automation = state.automation.state.lock().await;
    automation.ensure_available(&mac, Some(channel))?;
    state.server.set_outlet(&mac, channel, on).await
}

#[tauri::command]
pub async fn all_outlets_on(mac: String, state: State<'_, AppState>) -> Result<(), String> {
    let automation = state.automation.state.lock().await;
    automation.ensure_available(&mac, None)?;
    state.server.all_outlets_on(&mac).await
}

#[tauri::command]
pub async fn all_outlets_off(mac: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut automation = state.automation.state.lock().await;
    automation.pause_targets(Some(&mac))?;
    state.server.all_outlets_off(&mac).await
}

#[tauri::command]
pub async fn all_strips_off(state: State<'_, AppState>) -> Result<(), String> {
    let mut automation = state.automation.state.lock().await;
    automation.pause_targets(None)?;
    state.server.all_strips_off().await
}

#[tauri::command]
pub async fn refresh_device_telemetry(
    mac: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.server.refresh_telemetry(&mac).await?;
    let _ = state.server.refresh_diagnostics(&mac).await;
    Ok(())
}

#[tauri::command]
pub async fn send_raw_command(
    mac: String,
    command: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let automation = state.automation.state.lock().await;
    automation.ensure_available(&mac, None)?;
    state.server.send_raw(&mac, &command).await
}

#[tauri::command]
pub async fn get_telemetry_history(
    mac: String,
    channel: Option<u8>,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<TelemetryRecord>, String> {
    state
        .db
        .get_telemetry_history(&mac, channel, limit.unwrap_or(60))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_activity_logs(
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<ActivityLog>, String> {
    state
        .db
        .get_activity_logs(limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_network_info() -> Result<NetworkInfo, String> {
    tauri::async_runtime::spawn_blocking(get_local_network_info)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn scan_network(subnet: Option<String>) -> Result<Vec<NetworkHost>, String> {
    scan_subnet(subnet).await
}

#[tauri::command]
pub async fn derive_wifi_password(ssid: String) -> Result<String, String> {
    Ok(derive_ap_password(&ssid))
}

#[tauri::command]
pub fn supports_automatic_wifi_setup() -> bool {
    cfg!(target_os = "linux")
}

#[tauri::command]
pub async fn get_system_wifi_info() -> Result<SystemWifiInfo, String> {
    tauri::async_runtime::spawn_blocking(detect_system_wifi)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn auto_provision(
    request: AutoSetupRequest,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ProvisionResult, String> {
    let _guard = state
        .provision_gate
        .try_lock()
        .map_err(|_| "Another device setup is running. Wait for it to finish.")?;

    if let Some(port) = request.setup.controller_port
        && port != 10086
    {
        state.server.ensure_listening_port(&app, port).await?;
    }

    Ok(auto_provision_pipeline(request).await)
}

#[tauri::command]
pub async fn connect_system_wifi(ssid: String, password: Option<String>) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let mut cmd = tokio::process::Command::new("nmcli");
        cmd.kill_on_drop(true);
        cmd.args(["--wait", "20", "dev", "wifi", "connect", &ssid]);
        if let Some(ref pwd) = password
            && !pwd.is_empty()
        {
            cmd.args(["password", pwd]);
        }
        let out = tokio::time::timeout(std::time::Duration::from_secs(25), cmd.output())
            .await
            .map_err(|_| "Wi-Fi connection timed out. Check the current network before retrying.")?
            .map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(format!("Connected to {}", ssid))
        } else {
            Err(String::from_utf8_lossy(&out.stderr).to_string())
        }
    }

    #[cfg(target_os = "windows")]
    {
        // netsh connects an existing Wi-Fi profile; credentials belong to that profile.
        let _ = password;
        let profile_arg = format!("name={}", ssid);
        let mut command = tokio::process::Command::new("netsh");
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        command.kill_on_drop(true);
        command.args(["wlan", "connect", &profile_arg]);
        let out = tokio::time::timeout(std::time::Duration::from_secs(25), command.output())
            .await
            .map_err(|_| "Wi-Fi connection timed out. Check the current network before retrying.")?
            .map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(format!("Connected to {}", ssid))
        } else {
            Err(String::from_utf8_lossy(&out.stderr).to_string())
        }
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = (ssid, password);
        Err("System Wi-Fi connection is not supported on this platform".into())
    }
}

#[tauri::command]
pub async fn provision_device(
    request: SetupRequest,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ProvisionResult, String> {
    let _guard = state
        .provision_gate
        .try_lock()
        .map_err(|_| "Another device setup is running. Wait for it to finish.")?;

    if let Some(port) = request.controller_port
        && port != 10086
    {
        state.server.ensure_listening_port(&app, port).await?;
    }

    Ok(provision_strip(
        request.target_ip,
        request.target_port,
        request.controller_ip,
        request.controller_port,
        request.port_strategy,
        request.wifi_ssid,
        request.wifi_password,
    )
    .await)
}

#[tauri::command]
pub async fn get_server_status(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    let ports = state.server.listening_ports.read().await.clone();
    let port = ports.first().copied().unwrap_or(10086);
    Ok(ServerStatus {
        running: *state.server.is_running.read().await,
        port,
        ports,
        error: state.server.last_error.read().await.clone(),
    })
}

#[tauri::command]
pub async fn add_server_listener(
    port: u16,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ServerStatus, String> {
    state.server.ensure_listening_port(&app, port).await?;
    get_server_status(state).await
}

#[tauri::command]
pub async fn probe_setup_endpoint(
    target_ip: String,
    target_port: u16,
    controller_ip: Option<String>,
    test_port: Option<u16>,
) -> Result<SetupProbeResult, String> {
    Ok(probe_setup_impl(target_ip, target_port, controller_ip, test_port).await)
}

#[tauri::command]
pub async fn send_setup_command(
    target_ip: String,
    target_port: u16,
    command: String,
    timeout_ms: Option<u64>,
) -> Result<SetupCommandResponse, String> {
    Ok(send_setup_impl(target_ip, target_port, command, timeout_ms).await)
}

fn validate_history_input(
    mac: &str,
    channel: Option<u8>,
    from: i64,
    to: i64,
) -> Result<String, String> {
    let mac = normalize_mac(mac);
    if mac.len() != 12 || !mac.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Select a valid strip MAC".into());
    }
    if channel.is_some_and(|channel| !(1..=4).contains(&channel)) {
        return Err("Select an outlet from 1 to 4".into());
    }
    if from < 0 || to <= from || to.saturating_sub(from) > 31 * 86400 {
        return Err("Choose a history interval between 1 second and 31 days".into());
    }
    Ok(mac)
}
#[tauri::command]
pub async fn get_history_devices(state: State<'_, AppState>) -> Result<Vec<HistoryDevice>, String> {
    state
        .db
        .get_history_devices()
        .map_err(|error| error.to_string())
}
#[tauri::command]
pub async fn get_history_chart(
    mac: String,
    channel: Option<u8>,
    from: i64,
    to: i64,
    state: State<'_, AppState>,
) -> Result<HistoryChart, String> {
    let mac = validate_history_input(&mac, channel, from, to)?;
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.get_history_chart(&mac, channel, from, to))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}
#[tauri::command]
pub async fn get_history_page(
    mac: String,
    channel: Option<u8>,
    from: i64,
    to: i64,
    before: Option<i64>,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<HistoryPage, String> {
    let mac = validate_history_input(&mac, channel, from, to)?;
    state
        .db
        .get_history_page(
            &mac,
            channel,
            from,
            to,
            before,
            limit.unwrap_or(100).clamp(1, 500),
        )
        .map_err(|error| error.to_string())
}
#[tauri::command]
pub async fn get_data_stats(state: State<'_, AppState>) -> Result<DataStats, String> {
    state.db.get_data_stats().map_err(|error| error.to_string())
}
#[tauri::command]
pub async fn clear_data(
    kind: ClearDataKind,
    mac: Option<String>,
    channel: Option<u8>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ClearDataResult, String> {
    let mac = mac.map(|value| normalize_mac(&value));
    if mac
        .as_ref()
        .is_some_and(|value| value.len() != 12 || !value.chars().all(|ch| ch.is_ascii_hexdigit()))
    {
        return Err("Invalid strip MAC".into());
    }
    if channel.is_some_and(|value| !(1..=4).contains(&value))
        || (channel.is_some() && (mac.is_none() || !matches!(kind, ClearDataKind::Telemetry)))
    {
        return Err("Outlet clearing requires one strip and telemetry history".into());
    }
    if matches!(kind, ClearDataKind::Database) && mac.is_some() {
        return Err("Database reset applies to all strips".into());
    }
    let _provision = state
        .provision_gate
        .try_lock()
        .map_err(|_| "Wait for device setup to finish before clearing data")?;
    let mut automation = state.automation.state.lock().await;
    let _status = state.server.status_gate.lock().await;
    let result = state
        .db
        .clear_data(&kind, mac.as_deref(), channel)
        .map_err(|error| error.to_string())?;
    if matches!(kind, ClearDataKind::Database) {
        automation.reset();
        let mut sessions = state.server.sessions.write().await;
        for (_, session) in sessions.drain() {
            let _ = session.disconnect_tx.send(true);
        }
    }
    use tauri::Emitter;
    let _ = app.emit("data-cleared", kind);
    Ok(result)
}

#[tauri::command]
pub async fn get_automation(state: State<'_, AppState>) -> Result<AutomationOverview, String> {
    Ok(state.automation.state.lock().await.overview())
}
#[tauri::command]
pub async fn save_automation_plan(
    id: Option<i64>,
    definition: PlanDefinition,
    state: State<'_, AppState>,
) -> Result<AutomationPlan, String> {
    state
        .automation
        .state
        .lock()
        .await
        .save_plan(id, definition)
}
#[tauri::command]
pub async fn run_automation_plan(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    state.automation.state.lock().await.run_now(id).await
}
#[tauri::command]
pub async fn stop_automation_plan(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    state.automation.state.lock().await.stop_plan(id)
}
#[tauri::command]
pub async fn save_monitor_rule(
    id: Option<i64>,
    definition: MonitorDefinition,
    state: State<'_, AppState>,
) -> Result<MonitorRule, String> {
    state
        .automation
        .state
        .lock()
        .await
        .save_monitor(id, definition)
}
#[tauri::command]
pub async fn delete_automation(
    kind: String,
    id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.automation.state.lock().await.delete(&kind, id)
}
#[tauri::command]
pub async fn stop_all_automation(state: State<'_, AppState>) -> Result<(), String> {
    state.automation.state.lock().await.stop_all()
}
