use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

static BOOT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"^up:bootinfo:([^;\r\n]{1,32});([0-9A-Fa-f]{12});([0-9A-Fa-f]{12});([^;\r\n]{1,64});connect$"
    ).expect("valid protocol pattern")
});

static RELAY_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^up:(?:event:)?onoff:([0-4]):(on|off)$").expect("valid protocol pattern")
});

static POWER_REPORT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^up:power_report:([1-5]):(-?\d+)$").expect("valid protocol pattern")
});

static QUERY_RSSI_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^up:query:(-?\d+)$").expect("valid protocol pattern"));

static EVENT_CODES: LazyLock<HashMap<&'static str, &'static str>> = LazyLock::new(|| {
    let mut m = HashMap::new();
    m.insert("00", "Normal / OK");
    m.insert("01", "Overcurrent / Overload Trip (>16A)");
    m.insert("02", "Overheat / Thermal Cutoff Trip");
    m.insert("03", "Overvoltage / Transient Surge");
    m.insert("04", "Manual Switch / Pushbutton Toggled");
    m.insert("08", "Communication / Internal MCU Fault");
    m
});

pub const GETINFO_PREFIX: &str = "up:getinfo:";
pub const CMD_REBOOT: &str = "up:reboot:0\r\n";
pub const CMD_GETINFO: &str = "up:getinfo:all\r\n";
pub const CMD_QUERY_VOL: &str = "up:power_report:1:vol\r\n";
pub const CMD_QUERY_RSSI: &str = "up:query:wifirssi\r\n";

#[derive(Debug, Clone)]
pub struct ParsedBoot {
    pub model: String,
    pub mac: String,
    pub firmware: String,
}

#[derive(Debug, Clone)]
pub struct ParsedRelay {
    pub channel: u8,
    pub on: bool,
}

#[derive(Debug, Clone)]
pub struct ParsedTelemetryOutlet {
    pub channel: u8,
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
}

pub fn normalize_mac(mac: &str) -> String {
    mac.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_uppercase()
}

pub fn derive_ap_password(ssid: &str) -> String {
    let clean = ssid.trim();
    if let Some(idx) = clean.rfind('_') {
        let suffix = &clean[idx + 1..];
        format!("LGU_{}", suffix)
    } else {
        format!("LGU_{}", clean)
    }
}

pub fn parse_boot(line: &str) -> Option<ParsedBoot> {
    let trimmed = line.trim_matches(|c| c == '\0' || c == '\r' || c == '\n' || c == ' ');
    if let Some(caps) = BOOT_RE.captures(trimmed) {
        let model = caps.get(1)?.as_str().to_string();
        let mac1 = caps.get(2)?.as_str().to_uppercase();
        let mac2 = caps.get(3)?.as_str().to_uppercase();
        let firmware = caps.get(4)?.as_str().to_string();

        if mac1 == mac2 && mac1 != "000000000000" && mac1 != "FFFFFFFFFFFF" {
            return Some(ParsedBoot {
                model,
                mac: mac1,
                firmware,
            });
        }
    }
    None
}

pub fn parse_relay(line: &str) -> Option<ParsedRelay> {
    let trimmed = line.trim_matches(|c| c == '\0' || c == '\r' || c == '\n' || c == ' ');
    if let Some(caps) = RELAY_RE.captures(trimmed) {
        let ch: u8 = caps.get(1)?.as_str().parse().ok()?;
        let state_str = caps.get(2)?.as_str().to_lowercase();
        let on = state_str == "on";
        return Some(ParsedRelay { channel: ch, on });
    }
    None
}

pub fn parse_voltage(line: &str) -> Option<f64> {
    let trimmed = line.trim_matches(|c| c == '\0' || c == '\r' || c == '\n' || c == ' ');
    if let Some(caps) = POWER_REPORT_RE.captures(trimmed) {
        let raw_mv: i64 = caps.get(2)?.as_str().parse().ok()?;
        if raw_mv >= 50_000 {
            return Some((raw_mv as f64 / 100.0).round() / 10.0);
        }
    }
    None
}

pub fn parse_rssi(line: &str) -> Option<i32> {
    let trimmed = line.trim_matches(|c| c == '\0' || c == '\r' || c == '\n' || c == ' ');
    if let Some(caps) = QUERY_RSSI_RE.captures(trimmed) {
        return caps.get(1)?.as_str().parse().ok();
    }
    None
}

fn parse_flag(value: &str) -> Option<bool> {
    match value.to_ascii_lowercase().as_str() {
        "on" => Some(true),
        "off" => Some(false),
        _ => None,
    }
}

pub fn parse_getinfo(line: &str) -> Option<Vec<ParsedTelemetryOutlet>> {
    let trimmed = line.trim_matches(|c| c == '\0' || c == '\r' || c == '\n' || c == ' ');
    if !trimmed.starts_with(GETINFO_PREFIX) {
        return None;
    }

    let body = &trimmed[GETINFO_PREFIX.len()..];
    let parts: Vec<&str> = body.split(':').collect();

    // Must be exactly 8 parts: 1, <record1>, 2, <record2>, 3, <record3>, 4, <record4>
    if parts.len() != 8 {
        return None;
    }

    let mut outlets = Vec::new();

    for i in (0..8).step_by(2) {
        let channel: u8 = parts[i].parse().ok()?;
        if !(1..=4).contains(&channel)
            || outlets
                .iter()
                .any(|outlet: &ParsedTelemetryOutlet| outlet.channel == channel)
        {
            return None;
        }

        let fields: Vec<&str> = parts[i + 1].split(';').collect();
        if fields.len() != 12 {
            return None;
        }

        if [fields[6], fields[7], fields[8]]
            .iter()
            .any(|field| field.len() != 8 || !field.chars().all(|ch| ch.is_ascii_hexdigit()))
            || fields[10].len() != 2
            || !fields[10].chars().all(|ch| ch.is_ascii_hexdigit())
        {
            return None;
        }
        let countdown_sec: u32 = fields[0].parse().ok()?;
        let on = match fields[1].to_lowercase().as_str() {
            "on" => true,
            "off" => false,
            _ => return None,
        };
        let standby_threshold_w: u32 = fields[2].parse().ok()?;
        let overload_ok = parse_flag(fields[3])?;
        let overheat_ok = parse_flag(fields[4])?;
        let power_raw: u64 = fields[5].parse().ok()?;
        let energy_raw = u64::from_str_radix(fields[6], 16).ok()?;
        let sec_energy_raw = u64::from_str_radix(fields[7], 16).ok()?;
        let budget_raw = u64::from_str_radix(fields[8], 16).ok()?;
        let standby_cutoff_enabled = parse_flag(fields[9])?;
        let event_code = fields[10].to_uppercase();
        let temperature_c: i32 = fields[11].parse().ok()?;

        let power_w = (power_raw as f64) / 1000.0;
        let estimated_current_a = (power_w / 220.0 * 1000.0).round() / 1000.0;
        let energy_kwh = (energy_raw as f64) / 1000.0;
        let secondary_energy_kwh = (sec_energy_raw as f64) / 1000.0;
        let energy_budget_kwh = (budget_raw as f64) / 1000.0;

        let event_desc = EVENT_CODES
            .get(event_code.as_str())
            .unwrap_or(&"Custom Event")
            .to_string();

        outlets.push(ParsedTelemetryOutlet {
            channel,
            on,
            power_w,
            estimated_current_a,
            energy_kwh,
            secondary_energy_kwh,
            energy_budget_kwh,
            temperature_c,
            event_code,
            event_desc,
            overload_ok,
            overheat_ok,
            countdown_sec,
            standby_threshold_w,
            standby_cutoff_enabled,
        });
    }

    outlets.sort_by_key(|o| o.channel);
    Some(outlets)
}

pub fn build_onoff_cmd(channel: u8, on: bool) -> String {
    format!("up:onoff:{}:{}\r\n", channel, if on { "on" } else { "off" })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn telemetry(channels: &[u8]) -> String {
        format!(
            "up:getinfo:{}",
            channels
                .iter()
                .map(|channel| format!(
                    "{}:0;on;3;on;on;100000;000003E8;00000000;00000000;off;00;28",
                    channel
                ))
                .collect::<Vec<_>>()
                .join(":")
        )
    }
    #[test]
    fn rejects_wrong_hex_widths_and_invalid_events() {
        let frame = telemetry(&[1, 2, 3, 4]);
        for bad in [
            frame.replace("000003E8", "3E8"),
            frame.replace(";00;28", ";G0;28"),
            frame.replace(";00;28", ";0;28"),
        ] {
            assert!(parse_getinfo(&bad).is_none());
        }
        assert!(parse_boot("up:bootinfo:lgutap;000000000000;000000000000;test;connect").is_none());
    }
    #[test]
    fn accepts_four_distinct_channels_and_converts_measurements() {
        let outlets = parse_getinfo(&telemetry(&[1, 2, 3, 4])).unwrap();
        assert_eq!(outlets.len(), 4);
        assert_eq!(outlets[0].power_w, 100.0);
        assert_eq!(outlets[0].energy_kwh, 1.0);
    }
    #[test]
    fn rejects_duplicate_channels_and_invalid_protection_flags() {
        assert!(parse_getinfo(&telemetry(&[1, 1, 3, 4])).is_none());
        assert!(
            parse_getinfo(&telemetry(&[1, 2, 3, 4]).replace(";on;on;100000", ";invalid;on;100000"))
                .is_none()
        );
    }
    #[test]
    fn parses_voltage_rssi_and_master_relay_channel_zero() {
        assert_eq!(parse_voltage("up:power_report:1:224500\r\n"), Some(224.5));
        assert_eq!(parse_voltage("up:power_report:1:49999"), None); // sub-50000 ignored
        assert_eq!(parse_rssi("up:query:-52\r\n"), Some(-52));
        assert_eq!(parse_rssi("up:query:abc"), None);

        let master_relay = parse_relay("up:event:onoff:0:on").unwrap();
        assert_eq!(master_relay.channel, 0);
        assert!(master_relay.on);

        let master_relay_off = parse_relay("up:onoff:0:off\r\n").unwrap();
        assert_eq!(master_relay_off.channel, 0);
        assert!(!master_relay_off.on);
    }
}
