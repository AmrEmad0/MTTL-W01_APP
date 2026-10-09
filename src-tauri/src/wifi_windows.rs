//! Native WLAN discovery avoids console windows, localized netsh labels, and
//! Windows console code pages. Pure decoding helpers are also tested on Linux.
use crate::mttl::derive_ap_password;
use crate::types::{DetectedStripAp, SystemWifiInfo};

fn ssid_text(bytes: &[u8], length: usize) -> Option<String> {
    let bytes = bytes.get(..length)?;
    if bytes.is_empty() {
        return None;
    }
    Some(String::from_utf8_lossy(bytes).into_owned())
}

fn add_network(info: &mut SystemWifiInfo, ssid: String, mac: &[u8; 6]) {
    if !info.available_ssids.contains(&ssid) {
        info.available_ssids.push(ssid.clone());
    }
    if ssid.starts_with("TONLY_TAP_") || ssid.starts_with("ONLY_TAP_") {
        let bssid = mac
            .iter()
            .map(|b| format!("{b:02X}"))
            .collect::<Vec<_>>()
            .join(":");
        if !info
            .detected_strip_aps
            .iter()
            .any(|ap| ap.ssid == ssid && ap.bssid == bssid)
        {
            info.detected_strip_aps.push(DetectedStripAp {
                derived_password: derive_ap_password(&ssid),
                ssid,
                bssid,
            });
        }
    }
}

// Only use plaintext shared keys; denied profile access must not fail discovery.
fn profile_password(xml: &str) -> Option<String> {
    use quick_xml::{Reader, escape::unescape, events::Event};
    let mut reader = Reader::from_str(xml);
    let mut protected = None;
    let mut key = None;
    loop {
        match reader.read_event().ok()? {
            Event::Start(tag) if tag.local_name().as_ref() == "protected" => {
                protected = Some(reader.read_text(tag.name()).ok()?.as_ref().to_owned());
            }
            Event::Start(tag) if tag.local_name().as_ref() == "keyMaterial" => {
                let text = reader.read_text(tag.name()).ok()?;
                key = Some(unescape(text.as_ref()).ok()?.into_owned());
            }
            Event::Eof => break,
            _ => {}
        }
    }
    key.filter(|value| protected.as_deref() == Some("false") && !value.is_empty())
}

#[cfg(target_os = "windows")]
pub use native::detect;

#[cfg(target_os = "windows")]
mod native {
    use super::*;
    use std::{
        ffi::c_void,
        ptr::{null, null_mut},
        sync::mpsc,
        time::{Duration, Instant},
    };
    use windows_sys::{
        Win32::{Foundation::*, NetworkManagement::WiFi::*},
        core::GUID,
    };

    type ScanSender = mpsc::Sender<(GUID, u32)>;

    struct Client {
        handle: HANDLE,
        // Heap address stays stable for callbacks until WlanCloseHandle returns.
        sender: Box<ScanSender>,
    }
    impl Drop for Client {
        fn drop(&mut self) {
            // SAFETY: handle came from WlanOpenHandle. Closing discards pending
            // notifications and waits for callbacks before sender is dropped.
            unsafe {
                WlanCloseHandle(self.handle, null());
            }
        }
    }

    struct WlanMemory<T>(*mut T);
    impl<T> Drop for WlanMemory<T> {
        fn drop(&mut self) {
            // SAFETY: every buffer is allocated by WLAN and freed exactly once.
            unsafe {
                WlanFreeMemory(self.0.cast());
            }
        }
    }

    pub(super) fn error(code: u32) -> String {
        match code {
            ERROR_ACCESS_DENIED => "Windows denied Wi-Fi discovery. Enable Location services and app location access in Settings > Privacy & security > Location, then scan again.".into(),
            ERROR_SERVICE_NOT_ACTIVE => "Wi-Fi discovery failed. Start the Windows WLAN AutoConfig service, then scan again.".into(),
            ERROR_NDIS_DOT11_POWER_STATE_INVALID => "Wi-Fi is turned off. Enable the wireless adapter and turn off airplane mode, then scan again.".into(),
            _ => format!("Wi-Fi discovery unavailable: {}", std::io::Error::from_raw_os_error(code as i32)),
        }
    }

    fn check(code: u32) -> Result<(), String> {
        if code == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(error(code))
        }
    }

    unsafe extern "system" fn scan_notification(
        data: *mut L2_NOTIFICATION_DATA,
        context: *mut c_void,
    ) {
        if data.is_null() || context.is_null() {
            return;
        }
        // SAFETY: WLAN owns data for the callback; Client owns the sender until
        // closing the handle has waited for all callbacks to finish.
        unsafe {
            let data = &*data;
            if data.NotificationSource == WLAN_NOTIFICATION_SOURCE_ACM
                && (data.NotificationCode == wlan_notification_acm_scan_complete as u32
                    || data.NotificationCode == wlan_notification_acm_scan_fail as u32)
            {
                let sender = &*context.cast::<ScanSender>();
                let _ = sender.send((data.InterfaceGuid, data.NotificationCode));
            }
        }
    }

    fn same_guid(a: &GUID, b: &GUID) -> bool {
        a.data1 == b.data1 && a.data2 == b.data2 && a.data3 == b.data3 && a.data4 == b.data4
    }

    pub fn detect() -> Result<SystemWifiInfo, String> {
        let (sender, receiver) = mpsc::channel();
        let mut info = SystemWifiInfo {
            active_ssid: None,
            active_psk: None,
            available_ssids: Vec::new(),
            detected_strip_aps: Vec::new(),
        };
        // SAFETY: input pointers remain valid for every synchronous call. Each
        // successful WLAN allocation and handle immediately gains a Drop guard.
        // List tail arrays use their API-reported lengths, not the [T; 1] binding.
        unsafe {
            let mut handle = null_mut();
            let mut version = 0;
            check(WlanOpenHandle(2, null(), &mut version, &mut handle))?;
            let client = Client {
                handle,
                sender: Box::new(sender),
            };
            let mut interfaces = null_mut();
            check(WlanEnumInterfaces(handle, null(), &mut interfaces))?;
            let interfaces = WlanMemory(interfaces);
            let count = (*interfaces.0).dwNumberOfItems as usize;
            if count == 0 {
                return Err("No Windows Wi-Fi adapter found. Enable or connect a wireless adapter, then scan again.".into());
            }
            let adapters = std::slice::from_raw_parts(
                std::ptr::addr_of!((*interfaces.0).InterfaceInfo).cast::<WLAN_INTERFACE_INFO>(),
                count,
            );
            check(WlanRegisterNotification(
                handle,
                WLAN_NOTIFICATION_SOURCE_ACM,
                0,
                Some(scan_notification),
                (&*client.sender as *const ScanSender).cast(),
                null(),
                null_mut(),
            ))?;
            let mut scanned = false;
            let mut last_error = None;
            for adapter in adapters {
                let guid = &adapter.InterfaceGuid;
                // Ignore notifications from a previous scan before starting this one.
                while receiver.try_recv().is_ok() {}
                let code = WlanScan(handle, guid, null(), null(), null());
                if code != ERROR_SUCCESS {
                    last_error = Some(error(code));
                    continue;
                }
                // Microsoft specifies a 4-second scan deadline. A timeout falls
                // back to querying the list; an explicit scan failure is surfaced.
                let deadline = Instant::now() + Duration::from_secs(4);
                let mut failed = false;
                while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
                    match receiver.recv_timeout(remaining) {
                        Ok((id, code)) if same_guid(&id, guid) => {
                            failed = code == wlan_notification_acm_scan_fail as u32;
                            break;
                        }
                        Ok(_) => {}
                        Err(_) => break,
                    }
                }
                if failed {
                    last_error = Some("Windows could not complete the Wi-Fi scan. Check the wireless adapter and scan again.".into());
                    continue;
                }
                let mut networks = null_mut();
                let code = WlanGetNetworkBssList(
                    handle,
                    guid,
                    null(),
                    dot11_BSS_type_any,
                    0,
                    null(),
                    &mut networks,
                );
                if code != ERROR_SUCCESS {
                    last_error = Some(error(code));
                    continue;
                }
                let networks = WlanMemory(networks);
                let entries = std::slice::from_raw_parts(
                    std::ptr::addr_of!((*networks.0).wlanBssEntries).cast::<WLAN_BSS_ENTRY>(),
                    (*networks.0).dwNumberOfItems as usize,
                );
                for entry in entries {
                    if let Some(ssid) = ssid_text(
                        &entry.dot11Ssid.ucSSID,
                        entry.dot11Ssid.uSSIDLength as usize,
                    ) {
                        add_network(&mut info, ssid, &entry.dot11Bssid);
                    }
                }
                scanned = true;
                if adapter.isState == wlan_interface_state_connected && info.active_ssid.is_none() {
                    let mut connection = null_mut();
                    let mut size = 0;
                    let code = WlanQueryInterface(
                        handle,
                        guid,
                        wlan_intf_opcode_current_connection,
                        null(),
                        &mut size,
                        &mut connection,
                        null_mut(),
                    );
                    if code == ERROR_SUCCESS {
                        let connection =
                            WlanMemory(connection.cast::<WLAN_CONNECTION_ATTRIBUTES>());
                        let connection = &*connection.0;
                        let ssid = &connection.wlanAssociationAttributes.dot11Ssid;
                        info.active_ssid = ssid_text(&ssid.ucSSID, ssid.uSSIDLength as usize);
                        let mut xml = null_mut();
                        let mut flags = WLAN_PROFILE_GET_PLAINTEXT_KEY;
                        let mut access = 0;
                        if WlanGetProfile(
                            handle,
                            guid,
                            connection.strProfileName.as_ptr(),
                            null(),
                            &mut xml,
                            &mut flags,
                            &mut access,
                        ) == ERROR_SUCCESS
                        {
                            let xml = WlanMemory(xml);
                            let mut length = 0;
                            while *xml.0.add(length) != 0 {
                                length += 1;
                            }
                            let xml =
                                String::from_utf16_lossy(std::slice::from_raw_parts(xml.0, length));
                            info.active_psk = profile_password(&xml);
                        }
                    }
                }
            }
            if !scanned {
                return Err(last_error.unwrap_or_else(|| {
                    "Wi-Fi discovery failed. Check the wireless adapter.".into()
                }));
            }
        }
        Ok(info)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn empty_info() -> SystemWifiInfo {
        SystemWifiInfo {
            active_ssid: None,
            active_psk: None,
            detected_strip_aps: vec![],
            available_ssids: vec![],
        }
    }
    #[test]
    fn reads_length_delimited_ssids_including_unicode() {
        let ssid = "شبكة البيت".as_bytes();
        assert_eq!(ssid_text(ssid, ssid.len()).as_deref(), Some("شبكة البيت"));
        assert_eq!(ssid_text(b"HomeXYZ", 4).as_deref(), Some("Home"));
        assert_eq!(ssid_text(b"", 0), None);
        assert_eq!(ssid_text(b"Home", 33), None);
        assert!(ssid_text(&[0xff], 1).is_some());
    }
    #[test]
    fn deduplicates_networks_but_keeps_distinct_strip_radios() {
        let mut info = empty_info();
        for (ssid, mac) in [
            ("TONLY_TAP_AABBCC", [0x10, 0x20, 0x30, 0xaa, 0xbb, 0xcc]),
            ("TONLY_TAP_AABBCC", [0x10, 0x20, 0x30, 0xaa, 0xbb, 0xcc]),
            ("TONLY_TAP_AABBCC", [0x10, 0x20, 0x30, 0xaa, 0xbb, 0xcd]),
            ("ONLY_TAP_AABBCC", [0x10, 0x20, 0x30, 0xaa, 0xbb, 0xce]),
            ("Home", [1; 6]),
        ] {
            add_network(&mut info, ssid.into(), &mac);
        }
        assert_eq!(info.available_ssids.len(), 3);
        assert_eq!(info.detected_strip_aps.len(), 3);
        assert_eq!(info.detected_strip_aps[0].bssid, "10:20:30:AA:BB:CC");
        assert_eq!(
            info.detected_strip_aps[0].derived_password,
            derive_ap_password("TONLY_TAP_AABBCC")
        );
    }
    #[test]
    fn reads_only_plaintext_profile_keys_and_preserves_password_characters() {
        let xml = "<WLANProfile><sharedKey><protected>false</protected><keyMaterial> A&amp;B&lt;C&#x21; </keyMaterial></sharedKey></WLANProfile>";
        assert_eq!(profile_password(xml).as_deref(), Some(" A&B<C! "));
        assert_eq!(profile_password(&xml.replace("false", "true")), None);
        assert_eq!(profile_password("<WLANProfile/>"), None);
        assert_eq!(profile_password("<WLANProfile><keyMaterial>secret"), None);
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_errors_explain_how_to_recover() {
        assert!(native::error(5).contains("Location"));
        assert!(native::error(1062).contains("WLAN AutoConfig"));
        assert!(native::error(2150899714).contains("airplane mode"));
    }
}
