use std::collections::HashMap;
#[cfg(target_os = "linux")]
use std::fs;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;

use crate::types::{NetworkHost, NetworkInfo, NetworkInterfaceInfo};

const KNOWN_MTTL_OUIS: &[&str] = &["D8:AA:59", "88:D0:39", "2C:E0:32", "00:1E:C0", "00:26:E8"];

pub fn get_local_network_info() -> NetworkInfo {
    let mut local_ip = "127.0.0.1".to_string();
    #[cfg(target_os = "linux")]
    let mut default_gateway = String::new();
    #[cfg(not(target_os = "linux"))]
    let default_gateway = String::new();
    let mut subnet = String::new();
    let mut interfaces = Vec::new();

    // Determine primary outbound local IP
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0")
        && socket.connect("8.8.8.8:80").is_ok()
        && let Ok(addr) = socket.local_addr()
    {
        local_ip = addr.ip().to_string();
        if let IpAddr::V4(ipv4) = addr.ip() {
            let octets = ipv4.octets();
            subnet = format!("{}.{}.{}.0/24", octets[0], octets[1], octets[2]);
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = std::process::Command::new("ip")
            .args(["-j", "-4", "route", "show", "default"])
            .output()
            && output.status.success()
            && let Ok(routes) = serde_json::from_slice::<Vec<serde_json::Value>>(&output.stdout)
        {
            default_gateway = routes
                .iter()
                .find_map(|route| route["gateway"].as_str())
                .unwrap_or("")
                .to_string();
        }
        if let Ok(output) = std::process::Command::new("ip")
            .args(["-j", "-4", "addr", "show"])
            .output()
            && output.status.success()
            && let Ok(adapters) = serde_json::from_slice::<Vec<serde_json::Value>>(&output.stdout)
        {
            for adapter in adapters {
                if let Some(addresses) = adapter["addr_info"].as_array() {
                    for address in addresses {
                        if let (Some(ip), Some(prefix)) =
                            (address["local"].as_str(), address["prefixlen"].as_u64())
                        {
                            if ip.starts_with("127.") || prefix > 32 {
                                continue;
                            }
                            let mask = if prefix == 0 {
                                0
                            } else {
                                u32::MAX << (32 - prefix)
                            };
                            interfaces.push(NetworkInterfaceInfo {
                                name: adapter["ifname"].as_str().unwrap_or("Interface").into(),
                                ip: ip.into(),
                                netmask: Ipv4Addr::from(mask).to_string(),
                            });
                        }
                    }
                }
            }
        }
    }
    if interfaces.is_empty() && local_ip != "127.0.0.1" {
        interfaces.push(NetworkInterfaceInfo {
            name: "Primary".into(),
            ip: local_ip.clone(),
            netmask: String::new(),
        });
    }

    NetworkInfo {
        local_ip,
        subnet,
        default_gateway,
        interfaces,
    }
}

pub fn get_arp_cache() -> HashMap<String, String> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    let mut map = HashMap::new();
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    let map = HashMap::new();

    #[cfg(target_os = "linux")]
    if let Ok(content) = fs::read_to_string("/proc/net/arp") {
        for line in content.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let ip = parts[0].to_string();
                let mac = parts[3].to_uppercase();
                if mac != "00:00:00:00:00:00" && mac.contains(':') {
                    map.insert(ip, mac);
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;

    #[cfg(target_os = "windows")]
    if let Ok(output) = std::process::Command::new("arp")
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .arg("-a")
        .output()
    {
        // Only IP/MAC columns matter; localized headings need not be UTF-8.
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let ip = parts[0];
                let mac_raw = parts[1].replace('-', ":").to_uppercase();
                if mac_raw.contains(':') && mac_raw.len() == 17 {
                    map.insert(ip.to_string(), mac_raw);
                }
            }
        }
    }

    map
}

pub fn check_oui_match(mac: &str) -> Option<String> {
    let clean = mac.to_uppercase();
    for &oui in KNOWN_MTTL_OUIS {
        if clean.starts_with(oui) {
            return Some("TCL TONLY / LG U+ Smart Plug".to_string());
        }
    }
    None
}

async fn check_tcp_port(ip: &str, port: u16, timeout_ms: u64) -> bool {
    let addr_str = format!("{}:{}", ip, port);
    if let Ok(addr) = addr_str.parse::<SocketAddr>() {
        let connect_fut = TcpStream::connect(&addr);
        matches!(
            timeout(Duration::from_millis(timeout_ms), connect_fut).await,
            Ok(Ok(_))
        )
    } else {
        false
    }
}

fn subnet_base(value: &str) -> Result<String, String> {
    let mut parts = value.trim().split('/');
    let ip = parts
        .next()
        .unwrap_or("")
        .parse::<Ipv4Addr>()
        .map_err(|_| "Enter a valid IPv4 subnet")?;
    if parts.next().is_some_and(|prefix| prefix != "24") || parts.next().is_some() {
        return Err("Discovery supports /24 networks only".into());
    }
    let octets = ip.octets();
    Ok(format!("{}.{}.{}", octets[0], octets[1], octets[2]))
}

pub async fn scan_subnet(subnet: Option<String>) -> Result<Vec<NetworkHost>, String> {
    let requested = subnet
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| get_local_network_info().subnet);
    let base = subnet_base(&requested)?;

    let arp_cache = get_arp_cache();
    let mut tasks = Vec::new();

    for host_num in 1..=254 {
        let ip = format!("{}.{}", base, host_num);
        let arp_map = arp_cache.clone();

        tasks.push(tauri::async_runtime::spawn(async move {
            let start = std::time::Instant::now();

            // Probe port 30300 (MTTL setup AP), 10086 (MTTL runtime), and standard port 80
            let setup_30300 = check_tcp_port(&ip, 30300, 300).await;
            let runtime_10086 = check_tcp_port(&ip, 10086, 300).await;
            let port_80 = check_tcp_port(&ip, 80, 200).await;

            let mac = arp_map.get(&ip).cloned();
            let is_in_arp = mac.is_some();

            if setup_30300 || runtime_10086 || is_in_arp || port_80 {
                let ping_ms = start.elapsed().as_millis() as u64;
                let vendor = mac.as_ref().and_then(|m| check_oui_match(m));
                let is_mttl = setup_30300 || runtime_10086 || vendor.is_some();

                Some(NetworkHost {
                    ip,
                    mac,
                    vendor,
                    hostname: None,
                    is_mttl,
                    setup_port_open: setup_30300,
                    runtime_port_open: runtime_10086,
                    ping_ms: Some(ping_ms),
                })
            } else {
                None
            }
        }));
    }

    let mut results = Vec::new();
    for task in tasks {
        if let Ok(Some(host)) = task.await {
            results.push(host);
        }
    }

    // Sort by IP numerically
    results.sort_by(|a, b| {
        let a_last: u8 =
            a.ip.split('.')
                .next_back()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
        let b_last: u8 =
            b.ip.split('.')
                .next_back()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
        a_last.cmp(&b_last)
    });

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalizes_host_addresses_with_or_without_prefix() {
        assert_eq!(subnet_base("192.168.1.0/24").unwrap(), "192.168.1");
        assert_eq!(subnet_base("192.168.1.45/24").unwrap(), "192.168.1");
        assert_eq!(subnet_base("192.168.1.45").unwrap(), "192.168.1");
    }
    #[test]
    fn rejects_invalid_and_unsupported_scan_targets() {
        for input in [
            "192.168.1",
            "256.1.1.1/24",
            "192.168.1.0/16",
            "192.168.1.0/24/24",
            "",
        ] {
            assert!(subnet_base(input).is_err());
        }
    }
}
