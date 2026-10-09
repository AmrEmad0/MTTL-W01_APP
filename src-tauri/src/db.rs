use crate::types::*;
use rusqlite::{Connection, Result, params};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn connection(&self) -> Result<MutexGuard<'_, Connection>> {
        self.conn.lock().map_err(|_| rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_MISUSE),
            Some("Database access failed after an interrupted operation. Restart the application.".into()),
        ))
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.connection()?;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS devices (
                mac TEXT PRIMARY KEY,
                alias TEXT NOT NULL,
                model TEXT NOT NULL,
                firmware TEXT NOT NULL,
                ip TEXT NOT NULL,
                port INTEGER NOT NULL,
                online INTEGER NOT NULL DEFAULT 0,
                first_seen INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                voltage_v REAL,
                rssi_dbm INTEGER
            );

            CREATE TABLE IF NOT EXISTS removed_devices (
                mac TEXT PRIMARY KEY,
                removed_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS outlet_metadata (
                mac TEXT NOT NULL,
                channel INTEGER NOT NULL,
                custom_name TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT 'plug',
                PRIMARY KEY (mac, channel)
            );

            CREATE TABLE IF NOT EXISTS outlet_states (
                mac TEXT NOT NULL,
                channel INTEGER NOT NULL,
                on_state INTEGER NOT NULL DEFAULT 0,
                power_w REAL NOT NULL DEFAULT 0.0,
                estimated_current_a REAL NOT NULL DEFAULT 0.0,
                energy_kwh REAL NOT NULL DEFAULT 0.0,
                secondary_energy_kwh REAL NOT NULL DEFAULT 0.0,
                energy_budget_kwh REAL NOT NULL DEFAULT 0.0,
                temperature_c INTEGER NOT NULL DEFAULT 25,
                event_code TEXT NOT NULL DEFAULT '00',
                event_desc TEXT NOT NULL DEFAULT 'Normal / OK',
                overload_ok INTEGER NOT NULL DEFAULT 1,
                overheat_ok INTEGER NOT NULL DEFAULT 1,
                countdown_sec INTEGER NOT NULL DEFAULT 0,
                standby_threshold_w INTEGER NOT NULL DEFAULT 3,
                standby_cutoff_enabled INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                telemetry_at INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (mac, channel)
            );

            CREATE TABLE IF NOT EXISTS telemetry_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mac TEXT NOT NULL,
                channel INTEGER NOT NULL,
                relay_on INTEGER NOT NULL,
                power_w REAL NOT NULL,
                energy_kwh REAL NOT NULL,
                secondary_energy_kwh REAL NOT NULL,
                temperature_c INTEGER NOT NULL,
                event_code TEXT NOT NULL,
                recorded_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mac TEXT NOT NULL,
                event_type TEXT NOT NULL,
                details TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_telemetry_mac_ts ON telemetry_history(mac, recorded_at);
            CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_log(timestamp DESC);
            CREATE TABLE IF NOT EXISTS automation_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                payload TEXT NOT NULL
            );
            "#,
        )?;

        conn.execute_batch("CREATE TABLE IF NOT EXISTS telemetry_samples (id INTEGER PRIMARY KEY AUTOINCREMENT, mac TEXT NOT NULL, recorded_at INTEGER NOT NULL, connection_id INTEGER NOT NULL, raw_frame TEXT); CREATE INDEX IF NOT EXISTS idx_telemetry_channel_ts ON telemetry_history(mac, channel, recorded_at);")?;
        for (table, column, kind) in [
            ("removed_devices", "hidden", "INTEGER NOT NULL DEFAULT 0"),
            ("telemetry_history", "sample_id", "INTEGER"),
            ("telemetry_history", "energy_budget_kwh", "REAL"),
            ("telemetry_history", "overload_ok", "INTEGER"),
            ("telemetry_history", "overheat_ok", "INTEGER"),
            ("telemetry_history", "countdown_sec", "INTEGER"),
            ("telemetry_history", "standby_threshold_w", "INTEGER"),
            ("telemetry_history", "standby_cutoff_enabled", "INTEGER"),
            ("devices", "voltage_v", "REAL"),
            ("devices", "rssi_dbm", "INTEGER"),
        ] {
            let mut statement = conn.prepare(&format!("PRAGMA table_info({})", table))?;
            let columns = statement
                .query_map([], |row| row.get::<_, String>(1))?
                .collect::<Result<Vec<_>>>()?;
            if !columns.iter().any(|item| item == column) {
                conn.execute(
                    &format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, kind),
                    [],
                )?;
            }
        }
        conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_telemetry_sample ON telemetry_history(sample_id); CREATE INDEX IF NOT EXISTS idx_telemetry_mac_id ON telemetry_history(mac,id); CREATE INDEX IF NOT EXISTS idx_telemetry_frame_order ON telemetry_history(mac,recorded_at,sample_id,id);")?;
        // Preserve existing databases and recover telemetry timestamps from real history.
        let has_telemetry_at = {
            let mut statement = conn.prepare("PRAGMA table_info(outlet_states)")?;
            let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
            columns
                .collect::<Result<Vec<_>>>()?
                .iter()
                .any(|column| column == "telemetry_at")
        };
        if !has_telemetry_at {
            conn.execute(
                "ALTER TABLE outlet_states ADD COLUMN telemetry_at INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
            conn.execute("UPDATE outlet_states SET telemetry_at = COALESCE((SELECT MAX(recorded_at) FROM telemetry_history h WHERE h.mac = outlet_states.mac AND h.channel = outlet_states.channel), 0)", [])?;
        }
        Ok(())
    }

    pub fn upsert_device(
        &self,
        mac: &str,
        model: &str,
        firmware: &str,
        ip: &str,
        port: u16,
        online: bool,
    ) -> Result<()> {
        let conn = self.connection()?;
        let now = chrono::Utc::now().timestamp();

        let default_alias = format!("Strip {}", &mac[mac.len().saturating_sub(4)..]);

        conn.execute(
            r#"
            INSERT INTO devices (mac, alias, model, firmware, ip, port, online, first_seen, last_seen, notes)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, '')
            ON CONFLICT(mac) DO UPDATE SET
                model = ?3,
                firmware = ?4,
                ip = ?5,
                port = ?6,
                online = ?7,
                last_seen = ?8
            "#,
            params![mac, default_alias, model, firmware, ip, port, if online { 1 } else { 0 }, now],
        )?;

        // Ensure default 4 outlets metadata exist
        for ch in 1..=4 {
            let default_name = format!("Outlet {}", ch);
            conn.execute(
                r#"
                INSERT INTO outlet_metadata (mac, channel, custom_name, icon)
                VALUES (?1, ?2, ?3, 'plug')
                ON CONFLICT(mac, channel) DO NOTHING
                "#,
                params![mac, ch, default_name],
            )?;
        }

        Ok(())
    }

    pub fn is_device_removed(&self, mac: &str) -> Result<bool> {
        let conn = self.connection()?;
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM removed_devices WHERE mac = ?1)",
            params![mac],
            |row| row.get(0),
        )
    }

    pub fn remove_device(&self, mac: &str) -> Result<()> {
        let mut conn = self.connection()?;
        let transaction = conn.transaction()?;
        let exists: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM devices WHERE mac = ?1)",
            params![mac],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        transaction.execute("INSERT INTO removed_devices (mac, removed_at) VALUES (?1, ?2) ON CONFLICT(mac) DO UPDATE SET removed_at = excluded.removed_at, hidden = 0", params![mac, chrono::Utc::now().timestamp()])?;
        transaction.execute("UPDATE devices SET online = 0 WHERE mac = ?1", params![mac])?;
        transaction.commit()
    }

    pub fn restore_device(&self, mac: &str) -> Result<()> {
        let conn = self.connection()?;
        if conn.execute("DELETE FROM removed_devices WHERE mac = ?1", params![mac])? == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn get_removed_devices(&self) -> Result<Vec<RemovedDevice>> {
        let conn = self.connection()?;
        let mut statement = conn.prepare("SELECT d.mac, d.alias, d.ip, r.removed_at, r.hidden FROM removed_devices r JOIN devices d ON d.mac = r.mac ORDER BY r.removed_at DESC, d.alias")?;
        let rows = statement.query_map([], |row| {
            Ok(RemovedDevice {
                mac: row.get(0)?,
                alias: row.get(1)?,
                ip: row.get(2)?,
                removed_at: row.get(3)?,
                hidden: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn register_device(&self, mac: &str, ip: &str, alias: &str) -> Result<()> {
        let mut conn = self.connection()?;
        let transaction = conn.transaction()?;
        let now = chrono::Utc::now().timestamp();
        let active: bool = transaction.query_row("SELECT EXISTS(SELECT 1 FROM devices d WHERE d.mac = ?1 AND NOT EXISTS(SELECT 1 FROM removed_devices r WHERE r.mac = d.mac))", params![mac], |row| row.get(0))?;
        if active {
            return Err(rusqlite::Error::InvalidParameterName(
                "This strip is already registered".into(),
            ));
        }
        transaction.execute("INSERT INTO devices (mac, alias, model, firmware, ip, port, online, first_seen, last_seen, notes) VALUES (?1, ?2, '', '', ?3, 0, 0, ?4, 0, '') ON CONFLICT(mac) DO UPDATE SET alias = excluded.alias, ip = excluded.ip, online = 0", params![mac, alias, ip, now])?;
        for channel in 1..=4 {
            transaction.execute("INSERT INTO outlet_metadata (mac, channel, custom_name, icon) VALUES (?1, ?2, ?3, 'plug') ON CONFLICT(mac, channel) DO NOTHING", params![mac, channel, format!("Outlet {}", channel)])?;
        }
        transaction.execute("DELETE FROM removed_devices WHERE mac = ?1", params![mac])?;
        transaction.commit()
    }

    pub fn set_device_online(&self, mac: &str, online: bool) -> Result<()> {
        let conn = self.connection()?;
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE devices SET online = ?1, last_seen = ?2 WHERE mac = ?3",
            params![if online { 1 } else { 0 }, now, mac],
        )?;
        Ok(())
    }

    pub fn update_device_alias(&self, mac: &str, alias: &str, notes: &str) -> Result<()> {
        let conn = self.connection()?;
        let changed = conn.execute(
            "UPDATE devices SET alias = ?1, notes = ?2 WHERE mac = ?3",
            params![alias, notes, mac],
        )?;
        if changed == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn update_outlet_metadata(
        &self,
        mac: &str,
        channel: u8,
        custom_name: &str,
        icon: &str,
    ) -> Result<()> {
        let conn = self.connection()?;
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM devices WHERE mac=?1)",
            params![mac],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        conn.execute(
            r#"
            INSERT INTO outlet_metadata (mac, channel, custom_name, icon)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(mac, channel) DO UPDATE SET
                custom_name = ?3,
                icon = ?4
            "#,
            params![mac, channel, custom_name, icon],
        )?;
        Ok(())
    }

    pub fn save_outlet_relay_state(&self, mac: &str, channel: u8, on: bool) -> Result<()> {
        let conn = self.connection()?;
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            r#"
            INSERT INTO outlet_states (mac, channel, on_state, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(mac, channel) DO UPDATE SET
                on_state = ?3,
                updated_at = ?4
            "#,
            params![mac, channel, if on { 1 } else { 0 }, now],
        )?;
        conn.execute(
            "UPDATE devices SET last_seen = ?1 WHERE mac = ?2",
            params![now, mac],
        )?;
        Ok(())
    }

    pub fn save_telemetry_frame(
        &self,
        mac: &str,
        outlets: &[crate::mttl::ParsedTelemetryOutlet],
        raw_frame: Option<&str>,
        connection_id: u64,
    ) -> Result<()> {
        let mut conn = self.connection()?;
        let transaction = conn.transaction()?;
        let now = chrono::Utc::now().timestamp();

        transaction.execute("INSERT INTO telemetry_samples (mac, recorded_at, connection_id, raw_frame) VALUES (?1, ?2, ?3, ?4)", params![mac, now, connection_id, raw_frame])?;
        let sample_id = transaction.last_insert_rowid();
        for o in outlets {
            // Update latest state
            transaction.execute(
                r#"
                INSERT INTO outlet_states (
                    mac, channel, on_state, power_w, estimated_current_a,
                    energy_kwh, secondary_energy_kwh, energy_budget_kwh,
                    temperature_c, event_code, event_desc, overload_ok, overheat_ok,
                    countdown_sec, standby_threshold_w, standby_cutoff_enabled, updated_at, telemetry_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17)
                ON CONFLICT(mac, channel) DO UPDATE SET
                    on_state = ?3,
                    power_w = ?4,
                    estimated_current_a = ?5,
                    energy_kwh = ?6,
                    secondary_energy_kwh = ?7,
                    energy_budget_kwh = ?8,
                    temperature_c = ?9,
                    event_code = ?10,
                    event_desc = ?11,
                    overload_ok = ?12,
                    overheat_ok = ?13,
                    countdown_sec = ?14,
                    standby_threshold_w = ?15,
                    standby_cutoff_enabled = ?16,
                    updated_at = ?17,
                    telemetry_at = ?17
                "#,
                params![
                    mac,
                    o.channel,
                    if o.on { 1 } else { 0 },
                    o.power_w,
                    o.estimated_current_a,
                    o.energy_kwh,
                    o.secondary_energy_kwh,
                    o.energy_budget_kwh,
                    o.temperature_c,
                    o.event_code,
                    o.event_desc,
                    if o.overload_ok { 1 } else { 0 },
                    if o.overheat_ok { 1 } else { 0 },
                    o.countdown_sec,
                    o.standby_threshold_w,
                    if o.standby_cutoff_enabled { 1 } else { 0 },
                    now
                ],
            )?;

            transaction.execute("INSERT INTO telemetry_history (mac, channel, relay_on, power_w, energy_kwh, secondary_energy_kwh, temperature_c, event_code, recorded_at, sample_id, energy_budget_kwh, overload_ok, overheat_ok, countdown_sec, standby_threshold_w, standby_cutoff_enabled) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)", params![mac, o.channel, o.on, o.power_w, o.energy_kwh, o.secondary_energy_kwh, o.temperature_c, o.event_code, now, sample_id, o.energy_budget_kwh, o.overload_ok, o.overheat_ok, o.countdown_sec, o.standby_threshold_w, o.standby_cutoff_enabled])?;
        }

        transaction.execute(
            "UPDATE devices SET last_seen = ?1 WHERE mac = ?2",
            params![now, mac],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn log_activity(&self, mac: &str, event_type: &str, details: &str) -> Result<()> {
        let conn = self.connection()?;
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT INTO activity_log (mac, event_type, details, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![mac, event_type, details, now],
        )?;
        Ok(())
    }

    pub fn save_device_diagnostics(
        &self,
        mac: &str,
        voltage_v: Option<f64>,
        rssi_dbm: Option<i32>,
    ) -> Result<()> {
        let conn = self.connection()?;
        let now = chrono::Utc::now().timestamp();
        if let Some(vol) = voltage_v {
            conn.execute(
                "UPDATE devices SET voltage_v = ?1, last_seen = ?2 WHERE mac = ?3",
                params![vol, now, mac],
            )?;
        }
        if let Some(rssi) = rssi_dbm {
            conn.execute(
                "UPDATE devices SET rssi_dbm = ?1, last_seen = ?2 WHERE mac = ?3",
                params![rssi, now, mac],
            )?;
        }
        Ok(())
    }

    pub fn get_devices(&self) -> Result<Vec<DeviceInfo>> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare(
            "SELECT mac, alias, model, firmware, ip, port, online, first_seen, last_seen, notes, voltage_v, rssi_dbm FROM devices WHERE mac NOT IN (SELECT mac FROM removed_devices) ORDER BY alias ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            let mac: String = row.get(0)?;
            let alias: String = row.get(1)?;
            let model: String = row.get(2)?;
            let firmware: String = row.get(3)?;
            let ip: String = row.get(4)?;
            let port: u16 = row.get(5)?;
            let online: i64 = row.get(6)?;
            let first_seen: i64 = row.get(7)?;
            let last_seen: i64 = row.get(8)?;
            let notes: String = row.get(9)?;
            let voltage_v: Option<f64> = row.get(10).ok().flatten();
            let rssi_dbm: Option<i32> = row.get(11).ok().flatten();

            Ok((
                mac,
                alias,
                model,
                firmware,
                ip,
                port,
                online == 1,
                first_seen,
                last_seen,
                notes,
                voltage_v,
                rssi_dbm,
            ))
        })?;

        let mut devices = Vec::new();
        for r in rows {
            let (
                mac,
                alias,
                model,
                firmware,
                ip,
                port,
                online,
                first_seen,
                last_seen,
                notes,
                voltage_v,
                rssi_dbm,
            ) = r?;

            // Fetch outlets for this mac
            let outlets = self.get_outlets_internal(&conn, &mac)?;
            let total_power_w = outlets.iter().map(|o| o.power_w).sum::<f64>();
            let effective_vol = voltage_v.unwrap_or(220.0);
            let total_current_a = if effective_vol > 50.0 {
                (total_power_w / effective_vol * 1000.0).round() / 1000.0
            } else {
                (total_power_w / 220.0 * 1000.0).round() / 1000.0
            };

            devices.push(DeviceInfo {
                mac,
                alias,
                model,
                firmware,
                ip,
                port,
                online,
                first_seen,
                last_seen,
                notes,
                outlets,
                total_power_w,
                total_current_a,
                connection_id: 0,
                voltage_v,
                rssi_dbm,
            });
        }

        Ok(devices)
    }

    pub fn automation_records(&self, kind: &str) -> Result<Vec<(i64, String)>> {
        let conn = self.connection()?;
        let mut statement =
            conn.prepare("SELECT id,payload FROM automation_records WHERE kind=?1 ORDER BY id")?;

        statement
            .query_map(params![kind], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect()
    }

    pub fn save_automation_record(
        &self,
        kind: &str,
        id: Option<i64>,
        payload: &str,
    ) -> Result<i64> {
        let conn = self.connection()?;
        if let Some(id) = id {
            if conn.execute(
                "UPDATE automation_records SET payload=?1 WHERE id=?2 AND kind=?3",
                params![payload, id, kind],
            )? != 1
            {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }
            Ok(id)
        } else {
            conn.execute(
                "INSERT INTO automation_records(kind,payload) VALUES (?1,?2)",
                params![kind, payload],
            )?;
            Ok(conn.last_insert_rowid())
        }
    }

    pub fn delete_automation_record(&self, kind: &str, id: i64) -> Result<()> {
        self.connection()?.execute(
            "DELETE FROM automation_records WHERE id=?1 AND kind=?2",
            params![id, kind],
        )?;
        Ok(())
    }

    fn get_outlets_internal(&self, conn: &Connection, mac: &str) -> Result<Vec<OutletState>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT
                m.channel,
                COALESCE(m.custom_name, 'Outlet ' || m.channel),
                COALESCE(m.icon, 'plug'),
                COALESCE(s.on_state, 0),
                COALESCE(s.power_w, 0.0),
                COALESCE(s.estimated_current_a, 0.0),
                COALESCE(s.energy_kwh, 0.0),
                COALESCE(s.secondary_energy_kwh, 0.0),
                COALESCE(s.energy_budget_kwh, 0.0),
                COALESCE(s.temperature_c, 25),
                COALESCE(s.event_code, '00'),
                COALESCE(s.event_desc, 'Normal / OK'),
                COALESCE(s.overload_ok, 1),
                COALESCE(s.overheat_ok, 1),
                COALESCE(s.countdown_sec, 0),
                COALESCE(s.standby_threshold_w, 3),
                COALESCE(s.standby_cutoff_enabled, 0),
                COALESCE(s.updated_at, 0),
                COALESCE(s.telemetry_at, 0)
            FROM outlet_metadata m
            LEFT JOIN outlet_states s ON m.mac = s.mac AND m.channel = s.channel
            WHERE m.mac = ?1
            ORDER BY m.channel ASC
            "#,
        )?;

        let rows = stmt.query_map(params![mac], |row| {
            let channel: u8 = row.get(0)?;
            let custom_name: String = row.get(1)?;
            let icon: String = row.get(2)?;
            let on_state: i64 = row.get(3)?;
            let power_w: f64 = row.get(4)?;
            let estimated_current_a: f64 = row.get(5)?;
            let energy_kwh: f64 = row.get(6)?;
            let secondary_energy_kwh: f64 = row.get(7)?;
            let energy_budget_kwh: f64 = row.get(8)?;
            let temperature_c: i32 = row.get(9)?;
            let event_code: String = row.get(10)?;
            let event_desc: String = row.get(11)?;
            let overload_ok: i64 = row.get(12)?;
            let overheat_ok: i64 = row.get(13)?;
            let countdown_sec: u32 = row.get(14)?;
            let standby_threshold_w: u32 = row.get(15)?;
            let standby_cutoff_enabled: i64 = row.get(16)?;
            let updated_at: i64 = row.get(17)?;

            Ok(OutletState {
                channel,
                custom_name,
                icon,
                on: on_state == 1,
                power_w,
                estimated_current_a,
                energy_kwh,
                secondary_energy_kwh,
                energy_budget_kwh,
                temperature_c,
                event_code,
                event_desc,
                overload_ok: overload_ok == 1,
                overheat_ok: overheat_ok == 1,
                countdown_sec,
                standby_threshold_w,
                standby_cutoff_enabled: standby_cutoff_enabled == 1,
                updated_at,
                telemetry_at: row.get(18)?,
                report_revision: 0,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_telemetry_history(
        &self,
        mac: &str,
        channel: Option<u8>,
        limit: u32,
    ) -> Result<Vec<TelemetryRecord>> {
        let mut page = self.get_history_page(mac, channel, 0, i64::MAX, None, limit.min(5000))?;
        page.records.reverse();
        Ok(page.records)
    }
    fn history_record(row: &rusqlite::Row<'_>) -> Result<TelemetryRecord> {
        Ok(TelemetryRecord {
            id: row.get(0)?,
            sample_id: row.get(1)?,
            mac: row.get(2)?,
            channel: row.get(3)?,
            relay_on: row.get(4)?,
            power_w: row.get(5)?,
            energy_kwh: row.get(6)?,
            secondary_energy_kwh: row.get(7)?,
            temperature_c: row.get(8)?,
            event_code: row.get(9)?,
            recorded_at: row.get(10)?,
            energy_budget_kwh: row.get(11)?,
            overload_ok: row.get(12)?,
            overheat_ok: row.get(13)?,
            countdown_sec: row.get(14)?,
            standby_threshold_w: row.get(15)?,
            standby_cutoff_enabled: row.get(16)?,
            raw_frame: row.get(17)?,
        })
    }
    pub fn get_history_page(
        &self,
        mac: &str,
        channel: Option<u8>,
        from: i64,
        to: i64,
        before: Option<i64>,
        limit: u32,
    ) -> Result<HistoryPage> {
        let conn = self.connection()?;
        let mut statement = conn.prepare("SELECT h.id,h.sample_id,h.mac,h.channel,h.relay_on,h.power_w,h.energy_kwh,h.secondary_energy_kwh,h.temperature_c,h.event_code,h.recorded_at,h.energy_budget_kwh,h.overload_ok,h.overheat_ok,h.countdown_sec,h.standby_threshold_w,h.standby_cutoff_enabled,s.raw_frame FROM telemetry_history h LEFT JOIN telemetry_samples s ON s.id=h.sample_id WHERE h.mac=?1 AND (?2 IS NULL OR h.channel=?2) AND h.recorded_at>=?3 AND h.recorded_at<?4 AND (?5 IS NULL OR h.id<?5) ORDER BY h.id DESC LIMIT ?6")?;
        let mut records = statement
            .query_map(
                params![mac, channel, from, to, before, limit + 1],
                Self::history_record,
            )?
            .collect::<Result<Vec<_>>>()?;
        let more = records.len() > limit as usize;
        records.truncate(limit as usize);
        let next_before = if more {
            records.last().map(|record| record.id)
        } else {
            None
        };
        Ok(HistoryPage {
            records,
            next_before,
        })
    }
    pub fn get_history_chart(
        &self,
        mac: &str,
        channel: Option<u8>,
        from: i64,
        to: i64,
    ) -> Result<HistoryChart> {
        let conn = self.connection()?;
        let bucket_seconds = ((to - from + 239) / 240).max(10);
        let mut builder = crate::history::HistoryBuilder::new(channel, bucket_seconds);
        let mut statement = conn.prepare("SELECT id,sample_id,mac,channel,relay_on,power_w,energy_kwh,secondary_energy_kwh,temperature_c,event_code,recorded_at,energy_budget_kwh,overload_ok,overheat_ok,countdown_sec,standby_threshold_w,standby_cutoff_enabled,NULL FROM telemetry_history WHERE mac=?1 AND (?2 IS NULL OR channel=?2) AND recorded_at>=?3 AND recorded_at<?4 ORDER BY recorded_at,sample_id,id")?;
        let records = statement.query_map(params![mac, channel, from, to], Self::history_record)?;
        for record in records {
            builder.push(&record?);
        }
        let mut metadata = conn.prepare(
            "SELECT channel, custom_name FROM outlet_metadata WHERE mac=?1 ORDER BY channel",
        )?;
        let names = metadata
            .query_map(params![mac], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<(u8, String)>>>()?;
        Ok(builder.finish(&names))
    }
    pub fn get_history_devices(&self) -> Result<Vec<HistoryDevice>> {
        let conn = self.connection()?;
        let mut statement = conn.prepare("SELECT mac,alias,EXISTS(SELECT 1 FROM removed_devices r WHERE r.mac=d.mac),notes FROM devices d ORDER BY alias,mac")?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, bool>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        let mut devices = Vec::new();
        for row in rows {
            let (mac, alias, removed, notes) = row?;
            let mut metadata = conn.prepare(
                "SELECT channel, custom_name, icon FROM outlet_metadata WHERE mac=?1 ORDER BY channel",
            )?;
            let outlets = metadata
                .query_map(params![mac], |row| {
                    Ok(OutletUsageName {
                        channel: row.get(0)?,
                        name: row.get(1)?,
                        icon: row.get(2)?,
                    })
                })?
                .collect::<Result<Vec<_>>>()?;
            devices.push(HistoryDevice {
                mac,
                notes,
                alias,
                removed,
                outlets,
            });
        }
        Ok(devices)
    }
    pub fn get_data_stats(&self) -> Result<DataStats> {
        let conn = self.connection()?;
        conn.query_row("SELECT (SELECT COUNT(*) FROM devices),(SELECT COUNT(*) FROM removed_devices WHERE hidden=0),(SELECT COUNT(*) FROM removed_devices WHERE hidden=1),(SELECT COUNT(*) FROM telemetry_history),(SELECT COUNT(*) FROM telemetry_samples WHERE raw_frame IS NOT NULL),(SELECT COUNT(*) FROM activity_log)", [], |row| Ok(DataStats {devices:row.get(0)?,removed_visible:row.get(1)?,removed_hidden:row.get(2)?,telemetry:row.get(3)?,frames:row.get(4)?,activity:row.get(5)?}))
    }
    pub fn clear_data(
        &self,
        kind: &ClearDataKind,
        mac: Option<&str>,
        channel: Option<u8>,
    ) -> Result<ClearDataResult> {
        let mut conn = self.connection()?;
        let tx = conn.transaction()?;
        let mut result = ClearDataResult::default();
        if matches!(kind, ClearDataKind::RemovedList) {
            result.removed_hidden = tx.execute(
                "UPDATE removed_devices SET hidden=1 WHERE hidden=0 AND (?1 IS NULL OR mac=?1)",
                params![mac],
            )?;
        }
        if matches!(
            kind,
            ClearDataKind::Activity | ClearDataKind::RecordedData | ClearDataKind::Database
        ) {
            result.activity_deleted = tx.execute(
                "DELETE FROM activity_log WHERE (?1 IS NULL OR mac=?1)",
                params![mac],
            )?;
        }
        if matches!(
            kind,
            ClearDataKind::Telemetry | ClearDataKind::RecordedData | ClearDataKind::Database
        ) {
            // A whole-strip raw frame contains every outlet; remove it when any included outlet is cleared.
            tx.execute("UPDATE telemetry_samples SET raw_frame=NULL WHERE id IN (SELECT sample_id FROM telemetry_history WHERE (?1 IS NULL OR mac=?1) AND (?2 IS NULL OR channel=?2))",params![mac,channel])?;
            result.telemetry_deleted = tx.execute("DELETE FROM telemetry_history WHERE (?1 IS NULL OR mac=?1) AND (?2 IS NULL OR channel=?2)",params![mac,channel])?;
            tx.execute("DELETE FROM telemetry_samples WHERE NOT EXISTS(SELECT 1 FROM telemetry_history h WHERE h.sample_id=telemetry_samples.id)",[])?;
        }
        if matches!(kind, ClearDataKind::Database) {
            result.devices_deleted = tx.execute("DELETE FROM devices", [])?;
            tx.execute_batch("DELETE FROM removed_devices; DELETE FROM outlet_metadata; DELETE FROM outlet_states; DELETE FROM automation_records;")?;
        }
        tx.commit()?;
        Ok(result)
    }

    pub fn get_activity_logs(&self, limit: u32) -> Result<Vec<ActivityLog>> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, mac, event_type, details, timestamp FROM activity_log ORDER BY timestamp DESC LIMIT ?1"
        )?;

        let rows = stmt.query_map(params![limit], |row| {
            Ok(ActivityLog {
                id: row.get(0)?,
                mac: row.get(1)?,
                event_type: row.get(2)?,
                details: row.get(3)?,
                timestamp: row.get(4)?,
            })
        })?;

        let mut logs = Vec::new();
        for r in rows {
            logs.push(r?);
        }
        Ok(logs)
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn interrupted_database_access_returns_an_error_instead_of_panicking() {
        let db = Arc::new(Database::new(":memory:".into()).unwrap());
        let interrupted = Arc::clone(&db);
        let worker = std::thread::spawn(move || {
            let _guard = interrupted.conn.lock().unwrap();
            panic!("interrupted database operation");
        });
        assert!(worker.join().is_err());
        let error = db.get_devices().unwrap_err();
        assert!(error.to_string().contains("Restart the application"));
    }
    use super::*;
    fn database() -> Database {
        Database::new(PathBuf::from(":memory:")).unwrap()
    }

    fn capture(db: &Database, mac: &str) {
        db.upsert_device(mac, "lgutap", "test", "192.0.2.1", 10086, true)
            .unwrap();
        let frame = "up:getinfo:1:10;on;3;off;on;100000;000003E8;000001F4;00000064;on;01;30:2:0;off;3;on;on;0;00000000;00000000;00000000;off;00;25:3:0;off;3;on;on;0;00000000;00000000;00000000;off;00;25:4:0;off;3;on;on;0;00000000;00000000;00000000;off;00;25";
        let outlets = crate::mttl::parse_getinfo(frame).unwrap();
        db.save_telemetry_frame(mac, &outlets, Some(frame), 100)
            .unwrap();
    }
    #[test]
    fn charts_cover_the_entire_interval_beyond_the_table_page() {
        let db = database();
        db.register_device("001122334455", "192.0.2.1", "History")
            .unwrap();
        {
            let conn = db.conn.lock().unwrap();
            conn.execute_batch("WITH RECURSIVE ticks(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM ticks WHERE n<999), channels(ch) AS (SELECT 1 UNION ALL SELECT ch+1 FROM channels WHERE ch<4) INSERT INTO telemetry_history(mac,channel,relay_on,power_w,energy_kwh,secondary_energy_kwh,temperature_c,event_code,recorded_at) SELECT '001122334455',ch,1,100,n/1000.0,0,25,'00',1000+n*10 FROM ticks CROSS JOIN channels ORDER BY n,ch;").unwrap();
        }
        let page = db
            .get_history_page("001122334455", None, 1000, 11000, None, 100)
            .unwrap();
        assert_eq!(page.records.len(), 100);
        assert!(page.next_before.is_some());
        let chart = db
            .get_history_chart("001122334455", None, 1000, 11000)
            .unwrap();
        assert_eq!(chart.summary.record_count, 4000);
        assert_eq!(chart.summary.sample_count, 1000);
        assert_eq!(chart.summary.average_power_w, Some(400.0));
        assert!((chart.summary.observed_energy_kwh.unwrap() - 3.996).abs() < 1e-9);
        assert!(chart.points.len() <= 241);
    }
    #[test]
    fn full_capture_persists_and_history_pagination_has_no_duplicates() {
        let path = std::env::temp_dir().join(format!(
            "mttl-history-{}-{}.sqlite",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        {
            let db = Database::new(path.clone()).unwrap();
            capture(&db, "001122334455");
            db.update_device_alias("001122334455", "Production", "Rack A")
                .unwrap();
            db.update_outlet_metadata("001122334455", 1, "Pump", "plug")
                .unwrap();
        }
        {
            let db = Database::new(path.clone()).unwrap();
            let history = db
                .get_telemetry_history("001122334455", Some(1), 10)
                .unwrap();
            assert_eq!(history.len(), 1);
            assert_eq!(history[0].energy_budget_kwh, Some(0.1));
            assert_eq!(history[0].overload_ok, Some(false));
            assert_eq!(history[0].countdown_sec, Some(10));
            assert!(
                history[0]
                    .raw_frame
                    .as_ref()
                    .unwrap()
                    .starts_with("up:getinfo:")
            );
            let catalog = db.get_history_devices().unwrap();
            assert_eq!(catalog[0].alias, "Production");
            assert_eq!(catalog[0].outlets[0].name, "Pump");
            let mut cursor = None;
            let mut ids = vec![];
            loop {
                let page = db
                    .get_history_page("001122334455", None, 0, i64::MAX, cursor, 1)
                    .unwrap();
                ids.extend(page.records.iter().map(|record| record.id));
                cursor = page.next_before;
                if cursor.is_none() {
                    break;
                }
            }
            assert_eq!(ids.len(), 4);
            ids.sort();
            ids.dedup();
            assert_eq!(ids.len(), 4);
            assert!(
                db.get_history_page("001122334455", None, 0, 1, None, 100)
                    .unwrap()
                    .records
                    .is_empty()
            );
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn clearing_removed_list_keeps_exclusion_and_archived_history() {
        let db = database();
        capture(&db, "001122334455");
        db.remove_device("001122334455").unwrap();
        assert_eq!(
            db.clear_data(&ClearDataKind::RemovedList, None, None)
                .unwrap()
                .removed_hidden,
            1
        );
        assert!(db.get_removed_devices().unwrap()[0].hidden);
        assert!(db.is_device_removed("001122334455").unwrap());
        assert!(db.get_devices().unwrap().is_empty());
        assert!(db.get_history_devices().unwrap()[0].removed);
        assert_eq!(
            db.get_telemetry_history("001122334455", None, 10)
                .unwrap()
                .len(),
            4
        );
        assert_eq!(db.get_data_stats().unwrap().removed_visible, 0);
        db.restore_device("001122334455").unwrap();
        assert!(!db.get_devices().unwrap().is_empty());
    }
    #[test]
    fn scoped_clear_keeps_other_outlets_and_database_reset_clears_everything() {
        let db = database();
        capture(&db, "001122334455");
        capture(&db, "112233445566");
        for mac in ["001122334455", "112233445566"] {
            db.log_activity(mac, "boot", "Device boot").unwrap();
        }
        let result = db
            .clear_data(&ClearDataKind::Telemetry, Some("001122334455"), Some(1))
            .unwrap();
        assert_eq!(result.telemetry_deleted, 1);
        let remaining = db.get_telemetry_history("001122334455", None, 10).unwrap();
        assert_eq!(remaining.len(), 3);
        assert!(remaining.iter().all(|record| record.raw_frame.is_none()));
        assert!(
            db.get_telemetry_history("112233445566", None, 10).unwrap()[0]
                .raw_frame
                .is_some()
        );
        assert_eq!(db.get_devices().unwrap().len(), 2);
        assert_eq!(db.get_devices().unwrap()[0].outlets[0].power_w, 100.0);
        db.clear_data(&ClearDataKind::Activity, Some("001122334455"), None)
            .unwrap();
        assert_eq!(db.get_activity_logs(10).unwrap().len(), 1);
        db.clear_data(&ClearDataKind::Database, None, None).unwrap();
        let stats = db.get_data_stats().unwrap();
        assert_eq!(
            stats.devices
                + stats.telemetry
                + stats.activity
                + stats.frames
                + stats.removed_hidden
                + stats.removed_visible,
            0
        );
        let conn = db.conn.lock().unwrap();
        let caches:i64=conn.query_row("SELECT (SELECT COUNT(*) FROM outlet_states)+(SELECT COUNT(*) FROM outlet_metadata)",[],|row|row.get(0)).unwrap();
        assert_eq!(caches, 0);
    }
    #[test]
    fn legacy_capture_fields_are_unknown_and_migrations_are_repeatable() {
        let db = database();
        db.upsert_device("001122334455", "lgutap", "test", "192.0.2.1", 10086, true)
            .unwrap();
        {
            let conn = db.conn.lock().unwrap();
            conn.execute("INSERT INTO telemetry_history (mac,channel,relay_on,power_w,energy_kwh,secondary_energy_kwh,temperature_c,event_code,recorded_at) VALUES ('001122334455',1,1,100,2,1,30,'00',1000)",[]).unwrap();
        }
        db.init_schema().unwrap();
        db.init_schema().unwrap();
        let history = db.get_telemetry_history("001122334455", None, 10).unwrap();
        assert_eq!(history[0].energy_kwh, 2.0);
        assert!(history[0].overload_ok.is_none());
        assert!(history[0].raw_frame.is_none());
    }
    #[test]
    fn removal_persists_and_add_back_preserves_names_and_history() {
        let path = std::env::temp_dir().join(format!(
            "mttl-removal-{}-{}.sqlite",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        {
            let db = Database::new(path.clone()).unwrap();
            db.upsert_device("001122334455", "lgutap", "test", "192.0.2.1", 10086, true)
                .unwrap();
            db.update_device_alias("001122334455", "Production line", "Rack A")
                .unwrap();
            db.update_outlet_metadata("001122334455", 1, "Pump", "plug")
                .unwrap();
            db.log_activity("001122334455", "test", "Retained history")
                .unwrap();
            db.remove_device("001122334455").unwrap();
            assert!(db.get_devices().unwrap().is_empty());
        }
        {
            let db = Database::new(path.clone()).unwrap();
            assert!(db.is_device_removed("001122334455").unwrap());
            assert_eq!(
                db.get_removed_devices().unwrap()[0].alias,
                "Production line"
            );
            assert!(db.get_devices().unwrap().is_empty());
            db.restore_device("001122334455").unwrap();
            let device = db.get_devices().unwrap().remove(0);
            assert!(!device.online);
            assert_eq!(device.alias, "Production line");
            assert_eq!(device.notes, "Rack A");
            assert_eq!(device.outlets[0].custom_name, "Pump");
            assert_eq!(
                db.get_activity_logs(20).unwrap()[0].details,
                "Retained history"
            );
            assert!(db.get_removed_devices().unwrap().is_empty());
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn registration_never_fabricates_connection_and_rejects_duplicates() {
        let db = database();
        assert!(db.remove_device("001122334455").is_err());
        assert!(db.restore_device("001122334455").is_err());
        db.register_device("001122334455", "192.0.2.1", "Factory")
            .unwrap();
        let device = db.get_devices().unwrap().remove(0);
        assert!(!device.online);
        assert_eq!(device.last_seen, 0);
        assert!(device.outlets.iter().all(|outlet| outlet.telemetry_at == 0));
        assert!(
            db.register_device("001122334455", "192.0.2.2", "Duplicate")
                .is_err()
        );
        db.update_outlet_metadata("001122334455", 2, "Motor", "plug")
            .unwrap();
        db.remove_device("001122334455").unwrap();
        db.register_device("001122334455", "192.0.2.2", "Added again")
            .unwrap();
        assert_eq!(db.get_devices().unwrap()[0].outlets[1].custom_name, "Motor");
    }
    #[test]
    fn relay_reports_do_not_create_fake_telemetry() {
        let db = database();
        db.upsert_device("001122334455", "lgutap", "test", "192.0.2.1", 10086, true)
            .unwrap();
        let initial = db.get_devices().unwrap();
        assert_eq!(initial[0].outlets.len(), 4);
        assert!(
            initial[0]
                .outlets
                .iter()
                .all(|o| o.updated_at == 0 && o.telemetry_at == 0)
        );
        db.save_outlet_relay_state("001122334455", 1, true).unwrap();
        let reported = db.get_devices().unwrap();
        assert!(reported[0].outlets[0].on);
        assert!(reported[0].outlets[0].updated_at > 0);
        assert_eq!(reported[0].outlets[0].telemetry_at, 0);
    }
    #[test]
    fn legacy_database_upgrade_preserves_values_and_recovers_real_timestamp() {
        let db = database();
        db.upsert_device("001122334455", "lgutap", "test", "192.0.2.1", 10086, true)
            .unwrap();
        db.save_outlet_relay_state("001122334455", 1, true).unwrap();
        {
            let connection = db.conn.lock().unwrap();
            connection.execute("INSERT INTO telemetry_history (mac, channel, relay_on, power_w, energy_kwh, secondary_energy_kwh, temperature_c, event_code, recorded_at) VALUES ('001122334455', 1, 1, 100, 2, 1, 30, '00', 1000)", []).unwrap();
            connection
                .execute("ALTER TABLE outlet_states DROP COLUMN telemetry_at", [])
                .unwrap();
        }
        db.init_schema().unwrap();
        db.init_schema().unwrap();
        let devices = db.get_devices().unwrap();
        assert_eq!(devices[0].outlets[0].telemetry_at, 1000);
        assert!(devices[0].outlets[0].on);
        assert_eq!(devices[0].outlets[1].telemetry_at, 0);
    }
}
