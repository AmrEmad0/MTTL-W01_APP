use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, RwLock, broadcast, watch};

use crate::db::Database;
use crate::mttl::*;
use crate::types::*;

pub struct DeviceSession {
    pub tx: tokio::sync::mpsc::Sender<String>,
    pub telemetry_received: AtomicBool,
    pub reports: RwLock<HashMap<u8, u64>>,
    pub connection_id: u64,
    pub disconnect_tx: watch::Sender<bool>,
    pub voltage_v: RwLock<Option<f64>>,
    pub rssi_dbm: RwLock<Option<i32>>,
}

pub const DIAG_EVERY: u64 = 3;

pub struct ServerState {
    pub db: Arc<Database>,
    pub sessions: Arc<RwLock<HashMap<String, Arc<DeviceSession>>>>,
    pub poll_interval_sec: Arc<RwLock<u64>>,
    pub is_running: Arc<RwLock<bool>>,
    pub listening_ports: Arc<RwLock<Vec<u16>>>,
    pub last_error: Arc<RwLock<Option<String>>>,
    pub shutdown_tx: broadcast::Sender<()>,
    pub status_gate: Mutex<()>,
    next_connection_id: AtomicU64,
}

impl ServerState {
    pub fn new(db: Arc<Database>) -> Self {
        let (shutdown_tx, _) = broadcast::channel(1);
        Self {
            db,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            poll_interval_sec: Arc::new(RwLock::new(10)),
            is_running: Arc::new(RwLock::new(false)),
            listening_ports: Arc::new(RwLock::new(Vec::new())),
            last_error: Arc::new(RwLock::new(None)),
            shutdown_tx,
            status_gate: Mutex::new(()),
            next_connection_id: AtomicU64::new(chrono::Utc::now().timestamp_millis() as u64),
        }
    }

    pub async fn ensure_listening_port(
        self: &Arc<Self>,
        app: &AppHandle,
        port: u16,
    ) -> Result<(), String> {
        let ports = self.listening_ports.read().await;
        if ports.contains(&port) {
            return Ok(());
        }
        drop(ports);
        bind_listener_port(app.clone(), Arc::clone(self), "0.0.0.0", port).await
    }

    pub async fn send_raw(&self, mac: &str, line: &str) -> Result<(), String> {
        let norm_mac = normalize_mac(mac);
        let session = self.sessions.read().await.get(&norm_mac).cloned();
        if let Some(session) = session {
            let cmd = if line.ends_with("\r\n") {
                line.to_string()
            } else if line.ends_with('\n') {
                format!("{}\r\n", line.trim_end())
            } else {
                format!("{}\r\n", line)
            };

            tokio::time::timeout(std::time::Duration::from_secs(2), session.tx.send(cmd))
                .await
                .map_err(|_| "Device command queue timed out".to_string())?
                .map_err(|e| format!("Failed to send command to device queue: {}", e))?;
            Ok(())
        } else {
            Err(format!(
                "Device with MAC {} is not currently connected",
                norm_mac
            ))
        }
    }

    pub async fn set_outlet(&self, mac: &str, channel: u8, on: bool) -> Result<(), String> {
        if channel == 0 {
            return self.set_all_outlets(mac, on).await;
        }
        if !(1..=4).contains(&channel) {
            return Err("Channel must be between 1 and 4".to_string());
        }
        let cmd = build_onoff_cmd(channel, on);
        self.send_raw(mac, &cmd).await
    }

    pub async fn refresh_telemetry(&self, mac: &str) -> Result<(), String> {
        self.send_raw(mac, CMD_GETINFO).await
    }

    pub async fn refresh_diagnostics(&self, mac: &str) -> Result<(), String> {
        self.send_raw(mac, CMD_QUERY_VOL).await?;
        tokio::time::sleep(tokio::time::Duration::from_millis(60)).await;
        self.send_raw(mac, CMD_QUERY_RSSI).await
    }

    async fn set_all_outlets(&self, mac: &str, on: bool) -> Result<(), String> {
        let mut failures = Vec::new();
        for channel in 1..=4 {
            let cmd = build_onoff_cmd(channel, on);
            if let Err(error) = self.send_raw(mac, &cmd).await {
                failures.push(format!("Channel {}: {}", channel, error));
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(60)).await;
        }
        if failures.is_empty() {
            Ok(())
        } else {
            Err(failures.join("; "))
        }
    }

    pub async fn all_outlets_on(&self, mac: &str) -> Result<(), String> {
        self.set_all_outlets(mac, true).await
    }

    pub async fn all_outlets_off(&self, mac: &str) -> Result<(), String> {
        self.set_all_outlets(mac, false).await
    }

    pub async fn all_strips_off(&self) -> Result<(), String> {
        let macs = self.connected_macs().await;
        if macs.is_empty() {
            return Err("No strips are connected".into());
        }
        let mut failures = Vec::new();
        for mac in macs {
            if let Err(error) = self.all_outlets_off(&mac).await {
                failures.push(format!("{}: {}", mac, error));
            }
        }
        if failures.is_empty() {
            Ok(())
        } else {
            Err(failures.join("; "))
        }
    }

    pub async fn remove_device(&self, mac: &str) -> Result<(), String> {
        let mac = normalize_mac(mac);
        let _guard = self.status_gate.lock().await;
        self.db
            .remove_device(&mac)
            .map_err(|error| error.to_string())?;
        if let Some(session) = self.sessions.write().await.remove(&mac) {
            let _ = session.disconnect_tx.send(true);
        }
        let _ = self.db.log_activity(
            &mac,
            "device_removed",
            "Removed from controller; settings and history retained",
        );
        Ok(())
    }

    pub async fn reboot_device(&self, mac: &str) -> Result<u64, String> {
        let mac = normalize_mac(mac);
        let _guard = self.status_gate.lock().await;
        let session = self
            .sessions
            .read()
            .await
            .get(&mac)
            .cloned()
            .ok_or("Strip is offline; reboot is unavailable")?;
        self.send_raw(&mac, CMD_REBOOT).await?;
        let _ = self.db.log_activity(
            &mac,
            "reboot_requested",
            "Reboot queued; awaiting a new runtime connection",
        );
        Ok(session.connection_id)
    }

    pub async fn remove_session_if_current(
        &self,
        mac: &str,
        tx: &tokio::sync::mpsc::Sender<String>,
    ) -> bool {
        let _guard = self.status_gate.lock().await;
        let mut sessions = self.sessions.write().await;
        if sessions
            .get(mac)
            .is_some_and(|session| session.tx.same_channel(tx))
        {
            sessions.remove(mac);
            let _ = self.db.set_device_online(mac, false);
            true
        } else {
            false
        }
    }

    pub async fn connected_macs(&self) -> Vec<String> {
        let sessions = self.sessions.read().await;
        sessions.keys().cloned().collect()
    }
}

pub async fn bind_listener_port(
    app: AppHandle,
    state: Arc<ServerState>,
    host: &str,
    port: u16,
) -> Result<(), String> {
    {
        let ports = state.listening_ports.read().await;
        if ports.contains(&port) {
            return Ok(());
        }
    }

    let bind_addr = format!("{}:{}", host, port);
    let listener = (|| -> std::io::Result<TcpListener> {
        let addr: SocketAddr = bind_addr
            .parse()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))?;
        let domain = if addr.is_ipv4() {
            socket2::Domain::IPV4
        } else {
            socket2::Domain::IPV6
        };
        let socket =
            socket2::Socket::new(domain, socket2::Type::STREAM, Some(socket2::Protocol::TCP))?;
        socket.set_reuse_address(true)?;
        socket.bind(&addr.into())?;
        socket.listen(128)?;
        socket.set_nonblocking(true)?;
        let std_listener: std::net::TcpListener = socket.into();
        TcpListener::from_std(std_listener)
    })()
    .map_err(|e| format!("Cannot listen on {}: {}", bind_addr, e))?;

    println!("[MTTL SERVER] Listening on {}", bind_addr);
    {
        let mut ports = state.listening_ports.write().await;
        if !ports.contains(&port) {
            ports.push(port);
        }
        *state.is_running.write().await = true;
        *state.last_error.write().await = None;
    }

    let state_clone = Arc::clone(&state);
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut shutdown_rx = state_clone.shutdown_tx.subscribe();
        loop {
            tokio::select! {
                res = listener.accept() => {
                    match res {
                        Ok((stream, addr)) => {
                            println!("[MTTL SERVER] Incoming TCP connection on port {} from {}", port, addr);
                            let state_dev = Arc::clone(&state_clone);
                            let app_dev = app_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                handle_client(app_dev, state_dev, stream, addr).await;
                            });
                        }
                        Err(e) => {
                            eprintln!("[MTTL SERVER] Accept error on port {}: {}", port, e);
                        }
                    }
                }
                _ = shutdown_rx.recv() => {
                    println!("[MTTL SERVER] Received shutdown signal for port {}", port);
                    break;
                }
            }
        }

        let mut ports = state_clone.listening_ports.write().await;
        ports.retain(|&p| p != port);
        if ports.is_empty() {
            *state_clone.is_running.write().await = false;
        }
    });

    Ok(())
}

pub fn start_mttl_server(app: AppHandle, state: Arc<ServerState>, host: String, port: u16) {
    let state_clone = Arc::clone(&state);
    let app_handle = app.clone();

    // Start background polling loop
    let poll_state = Arc::clone(&state_clone);
    let poll_app = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        run_poll_loop(poll_app, poll_state).await;
    });

    tauri::async_runtime::spawn(async move {
        if let Err(e) = bind_listener_port(app_handle, state_clone.clone(), &host, port).await {
            eprintln!("[MTTL SERVER] Failed to bind {}: {}", host, e);
            *state_clone.last_error.write().await = Some(e);
        }
    });
}

async fn handle_client(
    app: AppHandle,
    state: Arc<ServerState>,
    stream: TcpStream,
    addr: SocketAddr,
) {
    let _ = stream.set_nodelay(true);
    let _ = socket2::SockRef::from(&stream).set_tcp_keepalive(
        &socket2::TcpKeepalive::new().with_time(std::time::Duration::from_secs(30)),
    );
    let connection_id = state.next_connection_id.fetch_add(1, Ordering::Relaxed);
    let (mut reader, mut writer) = stream.into_split();
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(32);

    let current_mac = Arc::new(Mutex::new(Option::<String>::None));
    let (disconnect_tx, mut disconnect_rx) = watch::channel(false);

    // Writer task
    let writer_mac = Arc::clone(&current_mac);
    let writer_app = app.clone();
    let writer_disconnect = disconnect_tx.clone();
    let write_task = tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let mac_str = writer_mac
                .lock()
                .await
                .clone()
                .unwrap_or_else(|| "UNKNOWN".into());
            let bytes = msg.as_bytes();
            let hex_str = bytes
                .iter()
                .map(|b| format!("{:02X}", b))
                .collect::<Vec<_>>()
                .join(" ");
            let _ = writer_app.emit(
                "raw-log",
                RawLogEvent {
                    timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
                    direction: "TX".into(),
                    mac: mac_str,
                    content: msg.trim_end().into(),
                    raw_hex: Some(hex_str),
                    byte_len: bytes.len(),
                    is_hex: false,
                },
            );

            if let Err(e) = writer.write_all(bytes).await {
                eprintln!("[MTTL TX ERROR] to {}: {}", addr, e);
                let _ = writer_disconnect.send(true);
                break;
            }
        }
    });

    let mut buf = vec![0u8; 4096];
    let mut line_buffer = Vec::new();

    'connection: loop {
        let received = tokio::select! {
            _ = disconnect_rx.changed() => break,
            received = tokio::time::timeout(std::time::Duration::from_secs(60), reader.read(&mut buf)) => received,
        };
        match received {
            Err(_) => {
                let _ = state.db.log_activity(
                    &addr.to_string(),
                    "connection_timeout",
                    "No response received for 60 seconds",
                );
                break;
            }
            Ok(result) => match result {
                Ok(0) => {
                    println!("[MTTL SERVER] Client {} disconnected", addr);
                    break;
                }
                Ok(n) => {
                    let chunk = &buf[..n];

                    // Emit raw log (hex and text)
                    let mac_str = current_mac
                        .lock()
                        .await
                        .clone()
                        .unwrap_or_else(|| addr.to_string());
                    let hex_str = chunk
                        .iter()
                        .map(|b| format!("{:02X}", b))
                        .collect::<Vec<_>>()
                        .join(" ");

                    let text_preview = String::from_utf8_lossy(chunk).replace('\0', "");
                    let trimmed = text_preview.trim();
                    let content = if trimmed.is_empty() {
                        let preview_hex = chunk
                            .iter()
                            .take(8)
                            .map(|b| format!("{:02X}", b))
                            .collect::<Vec<_>>()
                            .join(" ");
                        let ellipsis = if n > 8 { "..." } else { "" };
                        format!("<empty payload ({} B: {}{})>", n, preview_hex, ellipsis)
                    } else {
                        trimmed.to_string()
                    };

                    let _ = app.emit(
                        "raw-log",
                        RawLogEvent {
                            timestamp: chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
                            direction: "RX".into(),
                            mac: mac_str,
                            content,
                            raw_hex: Some(hex_str),
                            byte_len: n,
                            is_hex: false,
                        },
                    );

                    // Strip NUL bytes before processing CRLF lines
                    for &b in chunk {
                        if b == 0 {
                            continue;
                        }
                        if b == b'\n' {
                            let line_raw = line_buffer.clone();
                            line_buffer.clear();

                            let mut line_str = String::from_utf8_lossy(&line_raw).to_string();
                            if line_str.ends_with('\r') {
                                line_str.pop();
                            }
                            let line = line_str.trim();

                            if !line.is_empty()
                                && !handle_protocol_line(
                                    &app,
                                    &state,
                                    ProtocolConnection {
                                        current_mac: &current_mac,
                                        tx: &tx,
                                        disconnect_tx: &disconnect_tx,
                                        connection_id,
                                        addr,
                                    },
                                    line,
                                )
                                .await
                            {
                                break 'connection;
                            }
                        } else {
                            if line_buffer.len() >= 65536 {
                                break 'connection;
                            }
                            line_buffer.push(b);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[MTTL RX ERROR] from {}: {}", addr, e);
                    break;
                }
            },
        }
    }

    // Cleanup session
    write_task.abort();
    let mac_opt = current_mac.lock().await.clone();
    if let Some(mac) = mac_opt {
        // A superseded connection must not remove a newer session for this MAC.
        if state.remove_session_if_current(&mac, &tx).await {
            let _ =
                state
                    .db
                    .log_activity(&mac, "disconnected", &format!("Disconnected from {}", addr));
            let _ = app.emit("device-disconnected", mac);
        }
    }
}

struct ProtocolConnection<'a> {
    current_mac: &'a Arc<Mutex<Option<String>>>,
    tx: &'a tokio::sync::mpsc::Sender<String>,
    disconnect_tx: &'a watch::Sender<bool>,
    connection_id: u64,
    addr: SocketAddr,
}

async fn handle_protocol_line(
    app: &AppHandle,
    state: &Arc<ServerState>,
    connection: ProtocolConnection<'_>,
    line: &str,
) -> bool {
    let ProtocolConnection {
        current_mac,
        tx,
        disconnect_tx,
        connection_id,
        addr,
    } = connection;
    // 1. Bootinfo registration
    if let Some(boot) = parse_boot(line) {
        let mac = boot.mac.clone();
        println!(
            "[MTTL BOOT] Device {} ({}) connected from {}",
            mac, boot.model, addr
        );

        {
            let mut mac_guard = current_mac.lock().await;
            if mac_guard.as_ref().is_some_and(|identity| identity != &mac) {
                return false;
            }
            *mac_guard = Some(mac.clone());
        }

        let _status_guard = state.status_gate.lock().await;
        if *disconnect_tx.borrow() || state.db.is_device_removed(&mac).unwrap_or(true) {
            return false;
        }
        if state
            .db
            .upsert_device(
                &mac,
                &boot.model,
                &boot.firmware,
                &addr.ip().to_string(),
                addr.port(),
                true,
            )
            .is_err()
        {
            return false;
        }
        // Register session
        let session = Arc::new(DeviceSession {
            tx: tx.clone(),
            telemetry_received: AtomicBool::new(false),
            reports: RwLock::new(HashMap::new()),
            connection_id,
            disconnect_tx: disconnect_tx.clone(),
            voltage_v: RwLock::new(None),
            rssi_dbm: RwLock::new(None),
        });

        {
            let mut sessions = state.sessions.write().await;
            if let Some(previous) = sessions.insert(mac.clone(), session)
                && !previous.tx.same_channel(tx)
            {
                let _ = previous.disconnect_tx.send(true);
            }
        }

        let _ = state.db.log_activity(
            &mac,
            "boot",
            &format!(
                "Boot registration model={}, fw={}",
                boot.model, boot.firmware
            ),
        );

        // Send immediate getinfo:all, voltage report and wifi rssi queries
        let _ = tx.send(CMD_GETINFO.to_string()).await;
        let _ = tx.send(CMD_QUERY_VOL.to_string()).await;
        let _ = tx.send(CMD_QUERY_RSSI.to_string()).await;

        let _ = app.emit("device-connected", mac);
        return true;
    }

    // 2. Individual Relay state update or Master switch (ch 0)
    if let Some(relay) = parse_relay(line) {
        let mac_opt = current_mac.lock().await.clone();
        if let Some(mac) = mac_opt {
            println!(
                "[MTTL RELAY] Device {} Ch {} is {}",
                mac,
                relay.channel,
                if relay.on { "ON" } else { "OFF" }
            );
            let _status_guard = state.status_gate.lock().await;
            let session = state.sessions.read().await.get(&mac).cloned();
            if let Some(session) = session {
                if !session.tx.same_channel(tx) {
                    return true;
                }
                if relay.channel == 0 {
                    // Master physical button toggled: apply state to all 4 outlets
                    for ch in 1..=4 {
                        let _ = state.db.save_outlet_relay_state(&mac, ch, relay.on);
                        *session.reports.write().await.entry(ch).or_default() += 1;
                    }
                    let _ = state.db.log_activity(
                        &mac,
                        "master_relay_changed",
                        &format!(
                            "Master button turned all outlets {}",
                            if relay.on { "ON" } else { "OFF" }
                        ),
                    );
                    let _ = session.tx.send(CMD_GETINFO.to_string()).await;
                } else {
                    if let Err(error) =
                        state
                            .db
                            .save_outlet_relay_state(&mac, relay.channel, relay.on)
                    {
                        let _ = state
                            .db
                            .log_activity(&mac, "storage_error", &error.to_string());
                        return true;
                    }
                    *session
                        .reports
                        .write()
                        .await
                        .entry(relay.channel)
                        .or_default() += 1;
                    let _ = state.db.log_activity(
                        &mac,
                        "relay_changed",
                        &format!(
                            "Outlet {} turned {}",
                            relay.channel,
                            if relay.on { "ON" } else { "OFF" }
                        ),
                    );
                }
            } else {
                return true;
            }

            #[derive(serde::Serialize, Clone)]
            struct RelayPayload {
                mac: String,
                channel: u8,
                on: bool,
            }
            let _ = app.emit(
                "relay-change",
                RelayPayload {
                    mac,
                    channel: relay.channel,
                    on: relay.on,
                },
            );
        }
        return true;
    }

    // 3. Full 12-field Telemetry response
    if let Some(telemetry_outlets) = parse_getinfo(line) {
        let mac_opt = current_mac.lock().await.clone();
        if let Some(mac) = mac_opt {
            let _status_guard = state.status_gate.lock().await;
            let session = state.sessions.read().await.get(&mac).cloned();
            if let Some(session) = session {
                if !session.tx.same_channel(tx) {
                    return true;
                }
                if let Err(error) = state.db.save_telemetry_frame(
                    &mac,
                    &telemetry_outlets,
                    Some(line),
                    session.connection_id,
                ) {
                    let _ = state
                        .db
                        .log_activity(&mac, "storage_error", &error.to_string());
                    return true;
                }
                let mut reports = session.reports.write().await;
                for outlet in &telemetry_outlets {
                    *reports.entry(outlet.channel).or_default() += 1;
                }
                session.telemetry_received.store(true, Ordering::Release);
            } else {
                return true;
            }

            #[derive(serde::Serialize, Clone)]
            struct TelemetryPayload {
                mac: String,
            }
            let _ = app.emit("telemetry-update", TelemetryPayload { mac });
        }
        return true;
    }

    // 4. Line voltage report (up:power_report:1:<mV>)
    if let Some(vol) = parse_voltage(line) {
        let mac_opt = current_mac.lock().await.clone();
        if let Some(mac) = mac_opt {
            println!("[MTTL VOLTAGE] Device {} AC line voltage: {} V", mac, vol);
            let session = state.sessions.read().await.get(&mac).cloned();
            if let Some(session) = session {
                if !session.tx.same_channel(tx) {
                    return true;
                }
                *session.voltage_v.write().await = Some(vol);
            }
            let _ = state.db.save_device_diagnostics(&mac, Some(vol), None);
            let _ = app.emit(
                "diagnostics-update",
                serde_json::json!({ "mac": mac, "voltage_v": vol }),
            );
            let _ = app.emit("telemetry-update", serde_json::json!({ "mac": mac }));
        }
        return true;
    }

    // 5. Wi-Fi RSSI report (up:query:<dBm>)
    if let Some(rssi) = parse_rssi(line) {
        let mac_opt = current_mac.lock().await.clone();
        if let Some(mac) = mac_opt {
            println!("[MTTL RSSI] Device {} Wi-Fi signal: {} dBm", mac, rssi);
            let session = state.sessions.read().await.get(&mac).cloned();
            if let Some(session) = session {
                if !session.tx.same_channel(tx) {
                    return true;
                }
                *session.rssi_dbm.write().await = Some(rssi);
            }
            let _ = state.db.save_device_diagnostics(&mac, None, Some(rssi));
            let _ = app.emit(
                "diagnostics-update",
                serde_json::json!({ "mac": mac, "rssi_dbm": rssi }),
            );
            let _ = app.emit("telemetry-update", serde_json::json!({ "mac": mac }));
        }
        return true;
    }

    println!("[MTTL UNKNOWN FRAME] {}", line);
    true
}

async fn run_poll_loop(app: AppHandle, state: Arc<ServerState>) {
    let mut poll_count: u64 = 0;
    loop {
        let interval = *state.poll_interval_sec.read().await;
        tokio::time::sleep(tokio::time::Duration::from_secs(interval.max(2))).await;

        poll_count = poll_count.wrapping_add(1);
        let macs = state.connected_macs().await;
        for mac in macs {
            let _ = state.refresh_telemetry(&mac).await;
            if poll_count.is_multiple_of(DIAG_EVERY) {
                tokio::time::sleep(tokio::time::Duration::from_millis(60)).await;
                let _ = state.refresh_diagnostics(&mac).await;
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        }

        let _ = app.emit("poll-tick", ());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn state() -> ServerState {
        ServerState::new(Arc::new(
            Database::new(std::path::PathBuf::from(":memory:")).unwrap(),
        ))
    }
    fn session(tx: tokio::sync::mpsc::Sender<String>) -> Arc<DeviceSession> {
        Arc::new(DeviceSession {
            tx,
            telemetry_received: AtomicBool::new(false),
            reports: RwLock::new(HashMap::new()),
            connection_id: 1,
            disconnect_tx: watch::channel(false).0,
            voltage_v: RwLock::new(None),
            rssi_dbm: RwLock::new(None),
        })
    }
    #[tokio::test]
    async fn reboot_queues_documented_frame_and_returns_original_connection() {
        let state = state();
        assert!(
            state
                .reboot_device("001122334455")
                .await
                .unwrap_err()
                .contains("offline")
        );
        let (tx, mut rx) = tokio::sync::mpsc::channel(32);
        state
            .sessions
            .write()
            .await
            .insert("001122334455".into(), session(tx));
        assert_eq!(state.reboot_device("00:11:22:33:44:55").await.unwrap(), 1);
        assert_eq!(rx.recv().await.unwrap(), "up:reboot:0\r\n");
        drop(rx);
        assert!(state.reboot_device("001122334455").await.is_err());
    }
    #[tokio::test]
    async fn removal_disconnects_active_session_and_blocks_commands() {
        let state = state();
        state
            .db
            .register_device("001122334455", "192.0.2.1", "Factory")
            .unwrap();
        let (tx, _rx) = tokio::sync::mpsc::channel(32);
        let current = session(tx);
        let mut disconnected = current.disconnect_tx.subscribe();
        state
            .sessions
            .write()
            .await
            .insert("001122334455".into(), current);
        state.remove_device("001122334455").await.unwrap();
        disconnected.changed().await.unwrap();
        assert!(*disconnected.borrow());
        assert!(state.connected_macs().await.is_empty());
        assert!(state.db.is_device_removed("001122334455").unwrap());
        assert!(state.set_outlet("001122334455", 1, true).await.is_err());
    }
    #[tokio::test]
    async fn bulk_commands_report_disconnected_devices() {
        let state = state();
        assert!(
            state
                .all_outlets_on("001122334455")
                .await
                .unwrap_err()
                .contains("Channel 4")
        );
        assert!(state.all_outlets_off("001122334455").await.is_err());
        assert!(state.all_strips_off().await.is_err());
        assert!(state.set_outlet("001122334455", 5, true).await.is_err());
    }
    #[tokio::test]
    async fn bulk_commands_queue_each_channel_and_propagate_queue_failures() {
        let state = state();
        let (tx, mut rx) = tokio::sync::mpsc::channel(32);
        state
            .sessions
            .write()
            .await
            .insert("001122334455".into(), session(tx));
        state.all_outlets_off("001122334455").await.unwrap();
        for channel in 1..=4 {
            assert_eq!(
                rx.recv().await.unwrap(),
                format!("up:onoff:{}:off\r\n", channel)
            );
        }
        drop(rx);
        assert!(
            state
                .all_strips_off()
                .await
                .unwrap_err()
                .contains("001122334455")
        );
    }
    #[tokio::test]
    async fn old_connection_cleanup_preserves_reconnected_session() {
        let state = state();
        let (old, _old_rx) = tokio::sync::mpsc::channel(32);
        let (new, _new_rx) = tokio::sync::mpsc::channel(32);
        state
            .sessions
            .write()
            .await
            .insert("001122334455".into(), session(new.clone()));
        assert!(!state.remove_session_if_current("001122334455", &old).await);
        assert_eq!(state.connected_macs().await.len(), 1);
        assert!(state.remove_session_if_current("001122334455", &new).await);
        assert!(state.connected_macs().await.is_empty());
    }
}
