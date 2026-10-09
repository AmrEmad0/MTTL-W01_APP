#[cfg(target_os = "linux")]
use std::process::Command;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::timeout;

use crate::mttl::CMD_REBOOT;
#[cfg(target_os = "linux")]
use crate::mttl::derive_ap_password;
#[cfg(target_os = "linux")]
use crate::types::DetectedStripAp;
use crate::types::{
    ProvisionResult, ProvisionStep, SetupCommandResponse, SetupProbeItem, SetupProbeResult,
    SystemWifiInfo,
};

/// Configuration shared by manual setup and the automatic Wi-Fi pipeline.
/// Do not derive Debug: this request contains Wi-Fi credentials.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupRequest {
    pub target_ip: String,
    pub target_port: u16,
    pub controller_ip: String,
    pub controller_port: Option<u16>,
    pub port_strategy: Option<String>,
    pub wifi_ssid: String,
    pub wifi_password: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoSetupRequest {
    pub strip_ssid: String,
    pub strip_password: String,
    pub strip_bssid: Option<String>,
    pub setup: SetupRequest,
}

// NetworkManager escapes both colons and backslashes in terse output.
#[cfg(any(target_os = "linux", test))]
fn nmcli_fields(line: &str) -> Vec<String> {
    let mut fields = vec![String::new()];
    let mut escaped = false;
    for ch in line.chars() {
        if escaped {
            fields.last_mut().unwrap().push(ch);
            escaped = false;
        } else if ch == '\\' {
            escaped = true;
        } else if ch == ':' {
            fields.push(String::new());
        } else {
            fields.last_mut().unwrap().push(ch);
        }
    }
    if escaped {
        fields.last_mut().unwrap().push('\\');
    }
    fields
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
pub fn detect_system_wifi() -> Result<SystemWifiInfo, String> {
    Err("Wi-Fi discovery is unavailable on this platform. Use manual device setup.".into())
}

#[cfg(target_os = "windows")]
pub fn detect_system_wifi() -> Result<SystemWifiInfo, String> {
    crate::wifi_windows::detect()
}

#[cfg(target_os = "linux")]
pub fn detect_system_wifi() -> Result<SystemWifiInfo, String> {
    let mut active_ssid = None;
    let mut detected_strip_aps = Vec::new();
    let mut available_ssids = Vec::new();
    let mut active_psk = None;

    // Linux: Query NetworkManager via nmcli
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("nmcli")
            .args([
                "--wait",
                "10",
                "-t",
                "-f",
                "active,ssid,bssid",
                "dev",
                "wifi",
            ])
            .output()
            .map_err(|error| format!("Wi-Fi discovery unavailable: {}", error))?;
        if !output.status.success() {
            return Err(
                "Wi-Fi discovery failed. Check NetworkManager and the wireless adapter.".into(),
            );
        }
        if let Ok(text) = String::from_utf8(output.stdout) {
            for line in text.lines() {
                let parts = nmcli_fields(line);
                if parts.len() == 3 {
                    let is_active = parts[0] == "yes";
                    let ssid = parts[1].clone();
                    let bssid = parts[2].to_uppercase();

                    if !ssid.is_empty() {
                        if !available_ssids.contains(&ssid) {
                            available_ssids.push(ssid.clone());
                        }

                        if is_active && active_ssid.is_none() {
                            active_ssid = Some(ssid.clone());
                        }

                        if ssid.starts_with("TONLY_TAP_") || ssid.starts_with("ONLY_TAP_") {
                            let derived = derive_ap_password(&ssid);
                            if !detected_strip_aps
                                .iter()
                                .any(|d: &DetectedStripAp| d.ssid == ssid && d.bssid == bssid)
                            {
                                detected_strip_aps.push(DetectedStripAp {
                                    ssid: ssid.clone(),
                                    bssid,
                                    derived_password: derived,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    if let Some(ref ssid) = active_ssid
        && let Ok(output) = Command::new("nmcli")
            .args([
                "-s",
                "-g",
                "802-11-wireless-security.psk",
                "connection",
                "show",
                ssid,
            ])
            .output()
        && let Ok(psk) = String::from_utf8(output.stdout)
    {
        let clean = psk.trim().to_string();
        if !clean.is_empty() {
            active_psk = Some(clean);
        }
    }

    Ok(SystemWifiInfo {
        active_ssid,
        active_psk,
        detected_strip_aps,
        available_ssids,
    })
}

fn validate_setup_inputs(
    controller_ip: &str,
    controller_port: Option<u16>,
    ssid: &str,
    password: &str,
) -> Result<(), String> {
    if let Some(port) = controller_port
        && port == 0
    {
        return Err("Controller port must be between 1 and 65535".into());
    }
    let ip = controller_ip
        .trim()
        .parse::<std::net::Ipv4Addr>()
        .map_err(|_| "Invalid controller IPv4 address")?;
    if ip.is_loopback() || ip.is_unspecified() {
        return Err("Use a reachable controller IPv4 address".into());
    }
    if ssid.trim().is_empty() {
        return Err("Wi-Fi SSID is required".into());
    }
    if ssid
        .chars()
        .chain(password.chars())
        .any(|c| matches!(c, ':' | '\r' | '\n' | '\0'))
    {
        return Err("Wi-Fi credentials cannot contain colons, newlines, or NUL characters".into());
    }
    Ok(())
}

async fn expect_setup_reply<R: tokio::io::AsyncBufRead + Unpin>(
    reader: &mut R,
    expected: &str,
    timeout_ms: u64,
) -> Result<(), String> {
    let mut line = String::new();
    match timeout(
        Duration::from_millis(timeout_ms),
        reader.read_line(&mut line),
    )
    .await
    {
        Ok(Ok(0)) => Err(format!(
            "Strip closed the connection before acknowledging {}",
            expected
        )),
        Ok(Ok(_)) => {
            let clean = line.replace('\0', "");
            if clean.trim() == expected {
                Ok(())
            } else {
                Err(format!(
                    "Strip did not acknowledge {}. Check the device configuration.",
                    expected
                ))
            }
        }
        Ok(Err(error)) => Err(format!("Setup response could not be read: {}", error)),
        Err(_) => Err(format!(
            "No acknowledgement received within {} ms for {}",
            timeout_ms, expected
        )),
    }
}

pub async fn provision_strip(
    target_ip: String,
    target_port: u16,
    controller_ip: String,
    controller_port: Option<u16>,
    port_strategy: Option<String>,
    wifi_ssid: String,
    wifi_password: String,
) -> ProvisionResult {
    let mut steps = Vec::new();
    let addr = format!("{}:{}", target_ip, target_port);
    let port = controller_port.unwrap_or(10086);

    // Validate inputs before opening a socket.
    if let Err(message) =
        validate_setup_inputs(&controller_ip, controller_port, &wifi_ssid, &wifi_password)
    {
        return ProvisionResult {
            settings_applied: false,
            network_restored: None,
            success: false,
            logs: vec![],
            message,
        };
    }
    if target_ip.parse::<std::net::Ipv4Addr>().is_err() || target_port == 0 {
        return ProvisionResult {
            settings_applied: false,
            network_restored: None,
            success: false,
            logs: vec![],
            message: "Invalid strip IPv4 address or setup port".into(),
        };
    }
    // Step 1: Connect to Setup Socket
    let connect_fut = TcpStream::connect(&addr);
    let stream = match timeout(Duration::from_millis(5000), connect_fut).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            steps.push(ProvisionStep {
                step: 1,
                title: "Connection Failed".into(),
                success: false,
                message: format!("Could not connect to {}: {}. Ensure you are connected to TONLY_TAP_* Wi-Fi AP.", addr, e),
            });
            return ProvisionResult {
                settings_applied: false,
                network_restored: None,
                success: false,
                logs: steps,
                message: format!("Connection to {} failed: {}", addr, e),
            };
        }
        Err(_) => {
            steps.push(ProvisionStep {
                step: 1,
                title: "Connection Timeout".into(),
                success: false,
                message: format!("Timed out after 5000ms connecting to {}", addr),
            });
            return ProvisionResult {
                settings_applied: false,
                network_restored: None,
                success: false,
                logs: steps,
                message: "Connection timed out".into(),
            };
        }
    };

    steps.push(ProvisionStep {
        step: 1,
        title: "Connected".into(),
        success: true,
        message: format!("Successfully established TCP socket with {}.", addr),
    });

    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);

    // Step 2: Configure Controller IP & Port based on Strategy
    let strategy = port_strategy
        .as_deref()
        .unwrap_or(if port == 10086 {
            "standard"
        } else {
            "combined"
        })
        .to_lowercase();

    let (ip_cmd, secondary_cmd) = match strategy.as_str() {
        "combined" | "combined_colon" => {
            (format!("up:ip:{}:{}\r\n", controller_ip.trim(), port), None)
        }
        "combined_comma" => (format!("up:ip:{},{}\r\n", controller_ip.trim(), port), None),
        "separate_port" => (
            format!("up:ip:{}\r\n", controller_ip.trim()),
            Some(format!("up:port:{}\r\n", port)),
        ),
        "separate_set_port" => (
            format!("up:ip:{}\r\n", controller_ip.trim()),
            Some(format!("up:set:port:{}\r\n", port)),
        ),
        _ => (format!("up:ip:{}\r\n", controller_ip.trim()), None),
    };

    if let Err(e) = writer.write_all(ip_cmd.as_bytes()).await {
        steps.push(ProvisionStep {
            step: 2,
            title: "Send Controller IP".into(),
            success: false,
            message: format!("Failed to write IP command: {}", e),
        });
        return ProvisionResult {
            settings_applied: false,
            network_restored: None,
            success: false,
            logs: steps,
            message: "Failed writing controller IP".into(),
        };
    }

    if let Err(error) = expect_setup_reply(&mut reader, "up:ip:ip_ok", 4000).await {
        steps.push(ProvisionStep {
            step: 2,
            title: "Controller IP not confirmed".into(),
            success: false,
            message: format!("Sent: '{}'. Error: {}", ip_cmd.trim(), error),
        });
        return ProvisionResult {
            settings_applied: false,
            network_restored: None,
            success: false,
            logs: steps,
            message: error,
        };
    }

    let ip_confirm_msg = if port != 10086 && secondary_cmd.is_none() {
        format!(
            "Strip acknowledged controller {}:{} using command '{}'",
            controller_ip.trim(),
            port,
            ip_cmd.trim()
        )
    } else {
        format!(
            "Strip acknowledged controller address {}",
            controller_ip.trim()
        )
    };

    steps.push(ProvisionStep {
        step: 2,
        title: "Controller IP configured".into(),
        success: true,
        message: ip_confirm_msg,
    });

    // If there is a secondary port command (e.g. up:port:<port> or up:set:port:<port>)
    if let Some(cmd) = secondary_cmd {
        if let Err(e) = writer.write_all(cmd.as_bytes()).await {
            steps.push(ProvisionStep {
                step: 2,
                title: "Send Port Command Failed".into(),
                success: false,
                message: format!("Failed to send {}: {}", cmd.trim(), e),
            });
        } else {
            let mut reply = String::new();
            match timeout(Duration::from_millis(3000), reader.read_line(&mut reply)).await {
                Ok(Ok(_)) => {
                    let clean = reply.replace('\0', "").trim().to_string();
                    steps.push(ProvisionStep {
                        step: 2,
                        title: "Port Command Dispatched".into(),
                        success: true,
                        message: format!("Sent {}. Strip reply: '{}'", cmd.trim(), clean),
                    });
                }
                Ok(Err(e)) => {
                    steps.push(ProvisionStep {
                        step: 2,
                        title: "Port Command Dispatched".into(),
                        success: true,
                        message: format!(
                            "Sent {}. Error reading response: {} (proceeding)",
                            cmd.trim(),
                            e
                        ),
                    });
                }
                Err(_) => {
                    steps.push(ProvisionStep {
                        step: 2,
                        title: "Port Command Dispatched".into(),
                        success: true,
                        message: format!(
                            "Sent {}. No acknowledgement within 3000ms (proceeding)",
                            cmd.trim()
                        ),
                    });
                }
            }
        }
    }

    // Step 3: Configure Target Wi-Fi SSID & Password
    let wifi_cmd = format!("up:connect:{}:{}\r\n", wifi_ssid, wifi_password);
    if let Err(e) = writer.write_all(wifi_cmd.as_bytes()).await {
        steps.push(ProvisionStep {
            step: 3,
            title: "Send Wi-Fi Credentials".into(),
            success: false,
            message: format!("Failed to send Wi-Fi command: {}", e),
        });
        return ProvisionResult {
            settings_applied: false,
            network_restored: None,
            success: false,
            logs: steps,
            message: "Failed writing Wi-Fi credentials".into(),
        };
    }

    if let Err(error) = expect_setup_reply(&mut reader, "up:connect:connect_ok", 5000).await {
        steps.push(ProvisionStep {
            step: 3,
            title: "Wi-Fi settings not confirmed".into(),
            success: false,
            message: error.clone(),
        });
        return ProvisionResult {
            settings_applied: false,
            network_restored: None,
            success: false,
            logs: steps,
            message: error,
        };
    }
    steps.push(ProvisionStep {
        step: 3,
        title: "Wi-Fi settings configured".into(),
        success: true,
        message: format!("Strip acknowledged Wi-Fi settings for '{}'", wifi_ssid),
    });

    // Step 4: Reboot Strip into runtime mode
    let reboot_cmd = CMD_REBOOT;
    if let Err(error) = writer.write_all(reboot_cmd.as_bytes()).await {
        steps.push(ProvisionStep {
            step: 4,
            title: "Reboot command failed".into(),
            success: false,
            message: error.to_string(),
        });
        return ProvisionResult { settings_applied: true, network_restored: None, success: false, logs: steps, message: "Settings acknowledged, but the reboot command failed. Check the strip before retrying.".into() };
    }
    steps.push(ProvisionStep {
        step: 4,
        title: "Reboot Command Dispatched".into(),
        success: true,
        message: format!("Sent up:reboot:0. Strip will now connect to Wi-Fi and reach out to your controller on TCP port {}.", port),
    });

    ProvisionResult {
        settings_applied: true,
        network_restored: None,
        success: true,
        logs: steps,
        message: "Settings acknowledged and reboot command sent. Awaiting runtime connection."
            .into(),
    }
}

pub async fn auto_provision_pipeline(request: AutoSetupRequest) -> ProvisionResult {
    let AutoSetupRequest {
        strip_ssid,
        strip_password,
        strip_bssid,
        setup,
    } = request;
    let SetupRequest {
        controller_ip,
        controller_port,
        port_strategy,
        wifi_ssid: home_ssid,
        wifi_password: home_password,
        target_ip,
        target_port,
    } = setup;
    if let Err(message) =
        validate_setup_inputs(&controller_ip, controller_port, &home_ssid, &home_password)
    {
        return ProvisionResult {
            settings_applied: false,
            network_restored: None,
            success: false,
            logs: vec![],
            message,
        };
    }
    if !(strip_ssid.starts_with("TONLY_TAP_") || strip_ssid.starts_with("ONLY_TAP_"))
        || strip_password.is_empty()
    {
        return ProvisionResult {
            settings_applied: false,
            network_restored: None,
            success: false,
            logs: vec![],
            message: "A strip setup SSID and password are required".into(),
        };
    }
    if target_ip.parse::<std::net::Ipv4Addr>().is_err() || target_port == 0 {
        return ProvisionResult {
            settings_applied: false,
            network_restored: None,
            success: false,
            logs: vec![],
            message: "Invalid setup IPv4 address or port".into(),
        };
    }
    if let Some(ref bssid) = strip_bssid
        && (bssid.len() != 17
            || !bssid
                .split(':')
                .all(|part| part.len() == 2 && part.chars().all(|c| c.is_ascii_hexdigit())))
    {
        return ProvisionResult {
            settings_applied: false,
            network_restored: None,
            success: false,
            logs: vec![],
            message: "Invalid setup access-point BSSID".into(),
        };
    }
    if !cfg!(target_os = "linux") {
        return ProvisionResult { settings_applied: false, network_restored: None, success: false, logs: vec![], message: "Join the strip's Wi-Fi using the displayed password, then choose 'I am connected — send settings'.".into() };
    }
    let previous = match tauri::async_runtime::spawn_blocking(detect_system_wifi).await {
        Ok(Ok(info)) => info
            .active_ssid
            .filter(|ssid| !ssid.starts_with("TONLY_TAP_") && !ssid.starts_with("ONLY_TAP_")),
        _ => None,
    };
    // Profile UUIDs avoid guessing that a NetworkManager connection name equals its SSID.
    let previous_profile = if previous.is_some() {
        match tokio::process::Command::new("nmcli")
            .args(["-t", "-f", "UUID,TYPE", "connection", "show", "--active"])
            .output()
            .await
        {
            Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
                .lines()
                .find_map(|line| {
                    let (uuid, kind) = line.split_once(':')?;
                    (kind == "802-11-wireless" || kind == "wifi").then(|| uuid.to_string())
                }),
            _ => None,
        }
    } else {
        None
    };
    let mut command = tokio::process::Command::new("nmcli");
    command.kill_on_drop(true);
    command.args([
        "--wait",
        "20",
        "device",
        "wifi",
        "connect",
        &strip_ssid,
        "password",
        &strip_password,
    ]);
    if let Some(ref bssid) = strip_bssid {
        command.args(["bssid", bssid]);
    }
    let connection = timeout(Duration::from_secs(25), command.output()).await;
    let mut result = match connection {
        Ok(Ok(output)) if output.status.success() => {
            tokio::time::sleep(Duration::from_secs(3)).await;
            provision_strip(
                target_ip,
                target_port,
                controller_ip,
                controller_port,
                port_strategy,
                home_ssid.clone(),
                home_password.clone(),
            )
            .await
        }
        _ => ProvisionResult {
            settings_applied: false,
            network_restored: None,
            success: false,
            logs: vec![ProvisionStep {
                step: 1,
                title: "Setup Wi-Fi connection failed".into(),
                success: false,
                message: format!(
                    "Could not join '{}'. Check the password, adapter, and AP availability.",
                    strip_ssid
                ),
            }],
            message: "Unable to connect to the selected strip access point".into(),
        },
    };
    // Always attempt restoration, including a failed Wi-Fi switch or rejected setup.
    let mut restore = tokio::process::Command::new("nmcli");
    restore.kill_on_drop(true);
    let restore_name;
    if let Some(profile) = previous_profile {
        restore.args(["--wait", "20", "connection", "up", "uuid", &profile]);
        restore_name = previous.unwrap_or_else(|| home_ssid.clone());
    } else {
        restore.args(["--wait", "20", "device", "wifi", "connect", &home_ssid]);
        if !home_password.is_empty() {
            restore.args(["password", &home_password]);
        }
        restore_name = home_ssid;
    }
    let restored = matches!(timeout(Duration::from_secs(25), restore.output()).await, Ok(Ok(output)) if output.status.success());
    result.logs.push(ProvisionStep {
        step: 5,
        title: if restored {
            "Computer Wi-Fi restored".into()
        } else {
            "Computer Wi-Fi restoration failed".into()
        },
        success: restored,
        message: if restored {
            format!("Reconnected to '{}'", restore_name)
        } else {
            format!(
                "Reconnect this computer to '{}' manually before continuing.",
                restore_name
            )
        },
    });
    result.network_restored = Some(restored);
    result.success = result.success && restored;
    result.message = if !restored {
        "Computer Wi-Fi could not be restored. The setup queue has paused; reconnect manually before checking the strip.".into()
    } else if result.success {
        "Settings acknowledged and computer Wi-Fi restored. Waiting for the strip’s runtime connection.".into()
    } else {
        format!("{} Computer Wi-Fi was restored.", result.message)
    };
    result
}

pub async fn probe_setup_endpoint(
    target_ip: String,
    target_port: u16,
    controller_ip: Option<String>,
    test_port: Option<u16>,
) -> SetupProbeResult {
    let addr = format!("{}:{}", target_ip, target_port);
    let c_ip = controller_ip.unwrap_or_else(|| "192.168.1.155".into());
    let c_port = test_port.unwrap_or(10087);

    // Initial socket probe
    let connect_fut = TcpStream::connect(&addr);
    let stream = match timeout(Duration::from_millis(3500), connect_fut).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            return SetupProbeResult {
                target: addr.clone(),
                reachable: false,
                tests: Vec::new(),
                summary: format!(
                    "Cannot reach setup endpoint at {}: {}. Ensure this computer is connected to the strip setup AP (TONLY_TAP_*).",
                    addr, e
                ),
            };
        }
        Err(_) => {
            return SetupProbeResult {
                target: addr.clone(),
                reachable: false,
                tests: Vec::new(),
                summary: format!(
                    "Connection timed out after 3500ms to {}. Ensure this computer is connected to the strip setup AP.",
                    addr
                ),
            };
        }
    };
    drop(stream);

    let probe_queries = vec![
        ("up:query:ip", "Query Configured Controller IP"),
        ("up:query:port", "Query Configured Controller Port"),
        ("up:query:ver", "Query Firmware Version"),
        ("up:query:mac", "Query Physical MAC"),
        ("up:query:wifirssi", "Query Wi-Fi Signal RSSI"),
        ("up:query:all", "Query All State Information"),
        ("up:help", "Query Setup Help Commands"),
    ];

    let probe_ports = vec![
        (
            format!("up:ip:{}:{}", c_ip, c_port),
            "Test combined colon syntax (up:ip:<ip>:<port>)",
        ),
        (
            format!("up:ip:{},{}", c_ip, c_port),
            "Test combined comma syntax (up:ip:<ip>,<port>)",
        ),
        (
            format!("up:port:{}", c_port),
            "Test dedicated port syntax (up:port:<port>)",
        ),
        (
            format!("up:set:port:{}", c_port),
            "Test set port syntax (up:set:port:<port>)",
        ),
        (
            format!("up:server:{}:{}", c_ip, c_port),
            "Test server syntax (up:server:<ip>:<port>)",
        ),
        (
            format!("up:ip:{}", c_ip),
            "Standard IP baseline (up:ip:<ip>)",
        ),
    ];

    let mut tests = Vec::new();

    async fn execute_probe(addr: &str, cmd: &str, label: &str) -> SetupProbeItem {
        let start = std::time::Instant::now();
        let conn_res = timeout(Duration::from_millis(2000), TcpStream::connect(addr)).await;
        let mut stream = match conn_res {
            Ok(Ok(s)) => s,
            Ok(Err(e)) => {
                return SetupProbeItem {
                    command: cmd.to_string(),
                    label: label.to_string(),
                    response: format!("Connect failed: {}", e),
                    response_hex: String::new(),
                    status: "ERROR".to_string(),
                    latency_ms: start.elapsed().as_millis() as u64,
                };
            }
            Err(_) => {
                return SetupProbeItem {
                    command: cmd.to_string(),
                    label: label.to_string(),
                    response: "Connect timed out".to_string(),
                    response_hex: String::new(),
                    status: "TIMEOUT".to_string(),
                    latency_ms: start.elapsed().as_millis() as u64,
                };
            }
        };

        let formatted = format!("{}\r\n", cmd.trim());
        if stream.write_all(formatted.as_bytes()).await.is_err() {
            return SetupProbeItem {
                command: cmd.to_string(),
                label: label.to_string(),
                response: "Write failed".to_string(),
                response_hex: String::new(),
                status: "CLOSED".to_string(),
                latency_ms: start.elapsed().as_millis() as u64,
            };
        }

        let mut buf = [0u8; 512];
        let read_res = timeout(Duration::from_millis(1500), stream.read(&mut buf)).await;
        let elapsed = start.elapsed().as_millis() as u64;

        match read_res {
            Ok(Ok(0)) => SetupProbeItem {
                command: cmd.to_string(),
                label: label.to_string(),
                response: "<Connection closed by strip>".to_string(),
                response_hex: String::new(),
                status: "CLOSED".to_string(),
                latency_ms: elapsed,
            },
            Ok(Ok(n)) => {
                let raw_slice = &buf[..n];
                let hex_str = raw_slice
                    .iter()
                    .map(|b| format!("{:02X}", b))
                    .collect::<Vec<_>>()
                    .join(" ");
                let text_clean = String::from_utf8_lossy(raw_slice)
                    .replace('\0', "")
                    .replace("\r\n", "")
                    .trim()
                    .to_string();

                let status = if text_clean.is_empty() {
                    "EMPTY".to_string()
                } else if text_clean.contains("ok") || text_clean.starts_with("up:") {
                    "ACK".to_string()
                } else {
                    "UNRECOGNIZED".to_string()
                };

                SetupProbeItem {
                    command: cmd.to_string(),
                    label: label.to_string(),
                    response: text_clean,
                    response_hex: hex_str,
                    status,
                    latency_ms: elapsed,
                }
            }
            Ok(Err(e)) => SetupProbeItem {
                command: cmd.to_string(),
                label: label.to_string(),
                response: format!("Read error: {}", e),
                response_hex: String::new(),
                status: "ERROR".to_string(),
                latency_ms: elapsed,
            },
            Err(_) => SetupProbeItem {
                command: cmd.to_string(),
                label: label.to_string(),
                response: "<No response within 1500ms>".to_string(),
                response_hex: String::new(),
                status: "TIMEOUT".to_string(),
                latency_ms: elapsed,
            },
        }
    }

    for (cmd, label) in probe_queries {
        tests.push(execute_probe(&addr, cmd, label).await);
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    for (cmd, label) in probe_ports {
        tests.push(execute_probe(&addr, &cmd, label).await);
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    let acks: Vec<&SetupProbeItem> = tests.iter().filter(|t| t.status == "ACK").collect();
    let has_combined = tests.iter().any(|t| {
        t.command.starts_with("up:ip:")
            && t.command.contains(':')
            && t.command.matches(':').count() >= 3
            && t.status == "ACK"
    });
    let has_separate_port = tests
        .iter()
        .any(|t| t.command.starts_with("up:port:") && t.status == "ACK");

    let summary = if has_combined {
        "Success: Strip accepted combined format 'up:ip:<ip>:<port>'. You can provision devices with custom ports using the Combined strategy.".to_string()
    } else if has_separate_port {
        "Success: Strip acknowledged dedicated port command 'up:port:<port>'. Use the Separate Port strategy.".to_string()
    } else if acks.is_empty() {
        format!(
            "Completed {} probe tests. None of the candidate port commands returned an explicit ACK. The device may only support standard IPv4 (fixed port 10086) or requires full provisioning sequence.",
            tests.len()
        )
    } else {
        let ack_cmds: Vec<&str> = acks.iter().map(|a| a.command.as_str()).collect();
        format!(
            "Probe completed. Strip responded to {} commands: [{}].",
            acks.len(),
            ack_cmds.join(", ")
        )
    };

    SetupProbeResult {
        target: addr,
        reachable: true,
        tests,
        summary,
    }
}

pub async fn send_setup_command(
    target_ip: String,
    target_port: u16,
    command: String,
    timeout_ms: Option<u64>,
) -> SetupCommandResponse {
    let addr = format!("{}:{}", target_ip, target_port);
    let to_ms = timeout_ms.unwrap_or(2500);
    let start = std::time::Instant::now();

    let conn_fut = TcpStream::connect(&addr);
    let mut stream = match timeout(Duration::from_millis(to_ms), conn_fut).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            return SetupCommandResponse {
                command,
                raw_response: String::new(),
                raw_hex: String::new(),
                byte_count: 0,
                latency_ms: start.elapsed().as_millis() as u64,
                success: false,
                error: Some(format!("Could not connect to {}: {}", addr, e)),
            };
        }
        Err(_) => {
            return SetupCommandResponse {
                command,
                raw_response: String::new(),
                raw_hex: String::new(),
                byte_count: 0,
                latency_ms: start.elapsed().as_millis() as u64,
                success: false,
                error: Some(format!(
                    "Connection to {} timed out after {}ms",
                    addr, to_ms
                )),
            };
        }
    };

    let formatted = if command.ends_with("\r\n") {
        command.clone()
    } else if command.ends_with('\n') {
        format!("{}\r\n", command.trim_end())
    } else {
        format!("{}\r\n", command)
    };

    if let Err(e) = stream.write_all(formatted.as_bytes()).await {
        return SetupCommandResponse {
            command,
            raw_response: String::new(),
            raw_hex: String::new(),
            byte_count: 0,
            latency_ms: start.elapsed().as_millis() as u64,
            success: false,
            error: Some(format!("Write error: {}", e)),
        };
    }

    let mut buf = [0u8; 1024];
    let read_res = timeout(Duration::from_millis(to_ms), stream.read(&mut buf)).await;
    let elapsed = start.elapsed().as_millis() as u64;

    match read_res {
        Ok(Ok(0)) => SetupCommandResponse {
            command,
            raw_response: "<Connection closed by strip>".into(),
            raw_hex: String::new(),
            byte_count: 0,
            latency_ms: elapsed,
            success: false,
            error: Some("Strip closed the TCP connection".into()),
        },
        Ok(Ok(n)) => {
            let slice = &buf[..n];
            let raw_hex = slice
                .iter()
                .map(|b| format!("{:02X}", b))
                .collect::<Vec<_>>()
                .join(" ");
            let clean = String::from_utf8_lossy(slice).to_string();
            SetupCommandResponse {
                command,
                raw_response: clean,
                raw_hex,
                byte_count: n,
                latency_ms: elapsed,
                success: true,
                error: None,
            }
        }
        Ok(Err(e)) => SetupCommandResponse {
            command,
            raw_response: String::new(),
            raw_hex: String::new(),
            byte_count: 0,
            latency_ms: elapsed,
            success: false,
            error: Some(format!("Read error: {}", e)),
        },
        Err(_) => SetupCommandResponse {
            command,
            raw_response: "<No response within timeout>".into(),
            raw_hex: String::new(),
            byte_count: 0,
            latency_ms: elapsed,
            success: false,
            error: Some(format!("No response received within {}ms", to_ms)),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn discovery_decodes_ssid_and_bssid_without_merging_access_points() {
        let fields = nmcli_fields(r"yes:Factory\: West:AA\:BB\:CC\:DD\:EE\:FF");
        assert_eq!(fields, vec!["yes", "Factory: West", "AA:BB:CC:DD:EE:FF"]);
        assert_eq!(
            nmcli_fields(r"no:TONLY_TAP_123456:11\:22\:33\:44\:55\:66").len(),
            3
        );
    }
    #[tokio::test]
    async fn setup_requires_expected_acknowledgement_not_just_socket_data() {
        for reply in [
            "",
            "up:ip:failed\r\n",
            "up:ip:not_ip_ok\r\n",
            "unexpected\r\n",
        ] {
            let mut reader = BufReader::new(reply.as_bytes());
            assert!(
                expect_setup_reply(&mut reader, "up:ip:ip_ok", 100)
                    .await
                    .is_err()
            );
        }
        let mut reader = BufReader::new(b"\0up:ip:ip_ok\0\r\n".as_slice());
        assert!(
            expect_setup_reply(&mut reader, "up:ip:ip_ok", 100)
                .await
                .is_ok()
        );
    }
    #[tokio::test]
    async fn setup_timeout_is_failure() {
        let (reader, _writer) = tokio::io::duplex(128);
        let mut reader = BufReader::new(reader);
        assert!(
            expect_setup_reply(&mut reader, "up:ip:ip_ok", 10)
                .await
                .unwrap_err()
                .contains("No acknowledgement")
        );
    }
    #[test]
    fn credentials_are_validated_before_switching_networks() {
        assert!(
            validate_setup_inputs("192.0.2.1", None, "Factory", " password with spaces ").is_ok()
        );
        for (ip, ssid, password) in [
            ("127.0.0.1", "Factory", "password"),
            ("192.0.2.1", "Factory:bad", "password"),
            ("192.0.2.1", "Factory", "bad\0password"),
            ("192.0.2.1", "", "password"),
        ] {
            assert!(validate_setup_inputs(ip, None, ssid, password).is_err());
        }
    }
    #[tokio::test]
    async fn acknowledged_setup_preserves_password_spaces() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let (reader, mut writer) = stream.into_split();
            let mut reader = BufReader::new(reader);
            let mut frame = String::new();
            reader.read_line(&mut frame).await.unwrap();
            assert_eq!(frame, "up:ip:192.0.2.2\r\n");
            writer.write_all(b"up:ip:ip_ok\r\n").await.unwrap();
            frame.clear();
            reader.read_line(&mut frame).await.unwrap();
            assert_eq!(frame, "up:connect:Factory: password \r\n");
            writer
                .write_all(b"up:connect:connect_ok\r\n")
                .await
                .unwrap();
            frame.clear();
            reader.read_line(&mut frame).await.unwrap();
            assert_eq!(frame, "up:reboot:0\r\n");
        });
        let result = provision_strip(
            "127.0.0.1".into(),
            port,
            "192.0.2.2".into(),
            None,
            None,
            "Factory".into(),
            " password ".into(),
        )
        .await;
        server.await.unwrap();
        assert!(result.success);
        assert!(result.logs.iter().all(|step| step.success));
    }
    #[tokio::test]
    async fn provision_supports_custom_port_and_combined_strategy() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let (reader, mut writer) = stream.into_split();
            let mut reader = BufReader::new(reader);
            let mut frame = String::new();
            reader.read_line(&mut frame).await.unwrap();
            assert_eq!(frame, "up:ip:192.0.2.2:10087\r\n");
            writer.write_all(b"up:ip:ip_ok\r\n").await.unwrap();
            frame.clear();
            reader.read_line(&mut frame).await.unwrap();
            assert_eq!(frame, "up:connect:Factory: password \r\n");
            writer
                .write_all(b"up:connect:connect_ok\r\n")
                .await
                .unwrap();
            frame.clear();
            reader.read_line(&mut frame).await.unwrap();
            assert_eq!(frame, "up:reboot:0\r\n");
        });
        let result = provision_strip(
            "127.0.0.1".into(),
            port,
            "192.0.2.2".into(),
            Some(10087),
            Some("combined".into()),
            "Factory".into(),
            " password ".into(),
        )
        .await;
        server.await.unwrap();
        assert!(result.success);
        assert!(result.logs.iter().any(|s| s.message.contains("10087")));
    }
}
