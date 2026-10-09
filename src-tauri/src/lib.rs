mod automation;
mod commands;
mod db;
mod history;
mod mttl;
mod provision;
mod scanner;
mod server;
mod types;
#[cfg(any(target_os = "windows", test))]
mod wifi_windows;

use std::sync::Arc;
use tauri::Manager;

use commands::*;
use db::Database;
use server::{ServerState, start_mttl_server};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = Arc::new(Database::new(data_dir.join("mttl_controller.db"))?);
            let server_state = Arc::new(ServerState::new(Arc::clone(&db)));
            let automation = Arc::new(
                automation::AutomationEngine::new(Arc::clone(&db), Arc::clone(&server_state))
                    .map_err(std::io::Error::other)?,
            );
            automation.start(app.handle().clone());

            // Start TCP runtime server on 0.0.0.0:10086
            let app_handle = app.handle().clone();
            start_mttl_server(
                app_handle,
                Arc::clone(&server_state),
                "0.0.0.0".to_string(),
                10086,
            );

            // Register AppState
            app.manage(AppState {
                db,
                server: server_state,
                automation,
                provision_gate: tokio::sync::Mutex::new(()),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_devices,
            get_removed_devices,
            register_device,
            remove_device,
            restore_device,
            reboot_device,
            update_device_alias,
            update_outlet_metadata,
            set_outlet_state,
            all_outlets_on,
            all_outlets_off,
            all_strips_off,
            refresh_device_telemetry,
            send_raw_command,
            get_telemetry_history,
            get_history_devices,
            get_history_chart,
            get_history_page,
            get_data_stats,
            clear_data,
            get_activity_logs,
            get_network_info,
            scan_network,
            derive_wifi_password,
            provision_device,
            get_system_wifi_info,
            auto_provision,
            connect_system_wifi,
            get_server_status,
            add_server_listener,
            probe_setup_endpoint,
            send_setup_command,
            get_automation,
            save_automation_plan,
            run_automation_plan,
            stop_automation_plan,
            save_monitor_rule,
            delete_automation,
            stop_all_automation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
