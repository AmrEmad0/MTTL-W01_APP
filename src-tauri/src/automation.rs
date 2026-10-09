use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use chrono::{Datelike, Local, NaiveTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::sync::Mutex;

use crate::db::Database;
use crate::mttl::{build_onoff_cmd, normalize_mac};
use crate::server::ServerState;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct OutletTarget {
    pub mac: String,
    pub channel: u8,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScenarioStep {
    pub on: bool,
    pub duration_sec: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Trigger {
    Manual,
    Once { at: i64 },
    Weekly { time: String, weekdays: Vec<u32> },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlanDefinition {
    pub name: String,
    pub targets: Vec<OutletTarget>,
    pub steps: Vec<ScenarioStep>,
    pub repetitions: u32,
    pub trigger: Trigger,
    pub enabled: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AutomationPlan {
    pub id: i64,
    pub definition: PlanDefinition,
    pub next_run_at: Option<i64>,
    pub status: String,
    pub current_step: usize,
    pub completed_cycles: u32,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub message: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MonitorDefinition {
    pub name: String,
    pub target: OutletTarget,
    pub metric: String,
    pub comparison: String,
    pub threshold: f64,
    pub duration_sec: u32,
    pub action: String,
    pub enabled: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MonitorRule {
    pub id: i64,
    pub definition: MonitorDefinition,
    pub status: String,
    pub last_triggered_at: Option<i64>,
    pub message: String,
}
#[derive(Clone, Serialize)]
pub struct AutomationOverview {
    pub plans: Vec<AutomationPlan>,
    pub monitors: Vec<MonitorRule>,
}

#[derive(Clone)]
struct Observation {
    connection: u64,
    revision: u64,
    on: bool,
    telemetry_at: i64,
    fresh: bool,
    protected: bool,
    power: f64,
    temperature: f64,
}
struct ActiveRun {
    observations: Vec<Observation>,
    step: usize,
    cycle: u32,
    confirmation_deadline: Instant,
    hold_until: Option<Instant>,
}
#[derive(Default)]
struct WatchState {
    last_at: i64,
    connection: u64,
    since: Option<i64>,
    latched: bool,
    pending_off: Option<(Observation, Instant)>,
}

pub struct AutomationEngine {
    pub state: Mutex<AutomationState>,
}
pub struct AutomationState {
    db: Arc<Database>,
    server: Arc<ServerState>,
    plans: BTreeMap<i64, AutomationPlan>,
    monitors: BTreeMap<i64, MonitorRule>,
    runs: HashMap<i64, ActiveRun>,
    watches: HashMap<i64, WatchState>,
    last_tick_at: i64,
    emitter: Option<tauri::AppHandle>,
}

fn valid_target(target: &mut OutletTarget) -> Result<(), String> {
    target.mac = normalize_mac(&target.mac);
    if target.mac.len() != 12
        || !target.mac.chars().all(|c| c.is_ascii_hexdigit())
        || !(1..=4).contains(&target.channel)
    {
        return Err("Select a valid strip and outlet 1–4".into());
    }
    Ok(())
}
fn valid_name(name: &mut String) -> Result<(), String> {
    *name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("Enter a name of 1–80 characters".into());
    }
    Ok(())
}
fn validate_plan(definition: &mut PlanDefinition, now: i64) -> Result<(), String> {
    valid_name(&mut definition.name)?;
    if definition.targets.is_empty() || definition.targets.len() > 16 {
        return Err("Select between 1 and 16 outlets".into());
    }
    for target in &mut definition.targets {
        valid_target(target)?;
    }
    if definition.targets.iter().collect::<HashSet<_>>().len() != definition.targets.len() {
        return Err("An outlet can only be selected once".into());
    }
    if definition.steps.is_empty()
        || definition.steps.len() > 32
        || !(1..=10000).contains(&definition.repetitions)
        || definition
            .steps
            .iter()
            .any(|step| step.duration_sec > 86400)
        || (definition.steps.iter().any(|step| step.duration_sec == 0)
            && (definition.steps.len() != 1 || definition.repetitions != 1))
        || definition
            .steps
            .iter()
            .map(|step| step.duration_sec as u64)
            .sum::<u64>()
            * definition.repetitions as u64
            > 7 * 86400
    {
        return Err("Use 1–32 steps, 1–10,000 cycles, and a total hold time up to 7 days".into());
    }
    match &definition.trigger {
        Trigger::Once { at } if definition.enabled && *at <= now => {
            return Err("Choose a future start time".into());
        }
        Trigger::Weekly { time, weekdays }
            if (NaiveTime::parse_from_str(time, "%H:%M").is_err()
                || weekdays.is_empty()
                || weekdays.iter().any(|day| !(1..=7).contains(day))
                || weekdays.iter().collect::<HashSet<_>>().len() != weekdays.len()) =>
        {
            return Err("Choose a local time and at least one weekday".into());
        }
        _ => {}
    }
    Ok(())
}
fn validate_monitor(definition: &mut MonitorDefinition) -> Result<(), String> {
    valid_name(&mut definition.name)?;
    valid_target(&mut definition.target)?;
    if !["power", "temperature"].contains(&definition.metric.as_str())
        || !["above", "below"].contains(&definition.comparison.as_str())
        || !["alert", "off"].contains(&definition.action.as_str())
        || !definition.threshold.is_finite()
        || definition.threshold < 0.0
        || definition.threshold
            > if definition.metric == "power" {
                10000.0
            } else {
                150.0
            }
        || !(10..=86400).contains(&definition.duration_sec)
    {
        return Err(
            "Choose a valid threshold and a sustained duration of 10–86,400 seconds".into(),
        );
    }
    Ok(())
}

/// Local wall-clock schedules follow the computer timezone. Ambiguous DST times run once;
/// nonexistent local times are skipped. An already-consumed occurrence is never replayed.
fn next_occurrence(trigger: &Trigger, after: i64) -> Option<i64> {
    match trigger {
        Trigger::Manual => None,
        Trigger::Once { at } => (*at > after).then_some(*at),
        Trigger::Weekly { time, weekdays } => {
            let time = NaiveTime::parse_from_str(time, "%H:%M").ok()?;
            let date = Local.timestamp_opt(after, 0).single()?.date_naive();
            for offset in 0..=8 {
                let day = date.checked_add_signed(chrono::Duration::days(offset))?;
                if weekdays.contains(&day.weekday().number_from_monday())
                    && let Some(candidate) =
                        Local.from_local_datetime(&day.and_time(time)).earliest()
                    && candidate.timestamp() > after
                {
                    return Some(candidate.timestamp());
                }
            }
            None
        }
    }
}

impl AutomationEngine {
    pub fn new(db: Arc<Database>, server: Arc<ServerState>) -> Result<Self, String> {
        let mut state = AutomationState {
            db,
            server,
            plans: BTreeMap::new(),
            monitors: BTreeMap::new(),
            runs: HashMap::new(),
            watches: HashMap::new(),
            last_tick_at: Utc::now().timestamp(),
            emitter: None,
        };
        let now = Utc::now().timestamp();
        for (id, payload) in state
            .db
            .automation_records("plan")
            .map_err(|e| e.to_string())?
        {
            let mut plan: AutomationPlan =
                serde_json::from_str(&payload).map_err(|e| e.to_string())?;
            plan.id = id;
            if plan.status == "running" {
                plan.status = "interrupted".into();
                plan.message = "Controller restarted; the interrupted run was not resumed".into();
                plan.finished_at = Some(now);
            }
            if plan.next_run_at.is_some_and(|at| at <= now) {
                plan.status = "missed".into();
                plan.message =
                    "Start time passed while the controller was unavailable; run skipped".into();
                plan.next_run_at = next_occurrence(&plan.definition.trigger, now);
                if matches!(plan.definition.trigger, Trigger::Once { .. }) {
                    plan.definition.enabled = false;
                }
            }
            if !plan.definition.enabled {
                plan.next_run_at = None;
            }
            state.persist_plan(&plan)?;
            state.plans.insert(id, plan);
        }
        for (id, payload) in state
            .db
            .automation_records("monitor")
            .map_err(|e| e.to_string())?
        {
            let mut rule: MonitorRule =
                serde_json::from_str(&payload).map_err(|e| e.to_string())?;
            rule.id = id;
            if rule.status == "switching_off" {
                rule.status = "failed".into();
                rule.definition.enabled = false;
                rule.message = "Controller restarted before automatic shutoff confirmation; inspect the outlet".into();
                state.persist_monitor(&rule)?;
            } else {
                rule.status = if rule.definition.enabled {
                    "waiting"
                } else {
                    "disabled"
                }
                .into();
            }
            state.monitors.insert(id, rule);
        }
        Ok(Self {
            state: Mutex::new(state),
        })
    }
    pub fn start(self: &Arc<Self>, app: tauri::AppHandle) {
        let engine = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let mut timer = tokio::time::interval(Duration::from_millis(100));
            timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                timer.tick().await;
                let mut state = engine.state.lock().await;
                if state.emitter.is_none() {
                    state.emitter = Some(app.clone());
                }
                if let Err(error) = state.tick().await {
                    // A storage failure stops further switching until the user explicitly re-enables it.
                    state.runs.clear();
                    state.watches.clear();
                    for plan in state.plans.values_mut() {
                        plan.definition.enabled = false;
                        plan.next_run_at = None;
                        plan.status = "failed".into();
                        plan.message =
                            format!("Automation stopped after a storage error: {}", error);
                    }
                    for rule in state.monitors.values_mut() {
                        rule.definition.enabled = false;
                    }
                    let _ = state
                        .db
                        .log_activity("", "automation_storage_error", &error);
                }
            }
        });
    }
}

impl AutomationState {
    fn changed(&self) {
        if let Some(app) = &self.emitter {
            let _ = app.emit("automation-update", ());
        }
    }
    pub fn overview(&self) -> AutomationOverview {
        AutomationOverview {
            plans: self.plans.values().cloned().collect(),
            monitors: self.monitors.values().cloned().collect(),
        }
    }
    fn persist_plan(&self, plan: &AutomationPlan) -> Result<(), String> {
        self.db
            .save_automation_record(
                "plan",
                Some(plan.id),
                &serde_json::to_string(plan).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    fn persist_monitor(&self, rule: &MonitorRule) -> Result<(), String> {
        self.db
            .save_automation_record(
                "monitor",
                Some(rule.id),
                &serde_json::to_string(rule).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    fn ensure_registered(&self, targets: &[OutletTarget]) -> Result<(), String> {
        let devices = self.db.get_devices().map_err(|e| e.to_string())?;
        if targets
            .iter()
            .any(|target| !devices.iter().any(|device| device.mac == target.mac))
        {
            return Err("One of the selected strips is removed or unregistered".into());
        }
        Ok(())
    }
    pub fn save_plan(
        &mut self,
        id: Option<i64>,
        mut definition: PlanDefinition,
    ) -> Result<AutomationPlan, String> {
        let now = Utc::now().timestamp();
        validate_plan(&mut definition, now)?;
        self.ensure_registered(&definition.targets)?;
        if self.runs.contains_key(&id.unwrap_or(0)) {
            return Err("Stop the run before editing its scenario".into());
        }
        if id.is_some_and(|id| !self.plans.contains_key(&id)) {
            return Err("Schedule no longer exists".into());
        }
        let mut plan = AutomationPlan {
            id: id.unwrap_or(0),
            next_run_at: if definition.enabled {
                next_occurrence(&definition.trigger, now)
            } else {
                None
            },
            definition,
            status: "idle".into(),
            current_step: 0,
            completed_cycles: 0,
            started_at: None,
            finished_at: None,
            message: String::new(),
        };
        plan.id = self
            .db
            .save_automation_record(
                "plan",
                id,
                &serde_json::to_string(&plan).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
        self.plans.insert(plan.id, plan.clone());
        Ok(plan)
    }
    pub fn save_monitor(
        &mut self,
        id: Option<i64>,
        mut definition: MonitorDefinition,
    ) -> Result<MonitorRule, String> {
        validate_monitor(&mut definition)?;
        self.ensure_registered(std::slice::from_ref(&definition.target))?;
        if id.is_some_and(|id| !self.monitors.contains_key(&id)) {
            return Err("Monitor no longer exists".into());
        }
        if id.is_some_and(|id| {
            self.watches
                .get(&id)
                .is_some_and(|watch| watch.pending_off.is_some())
        }) {
            return Err("A monitoring shutoff is awaiting confirmation".into());
        }
        let last_triggered_at = id.and_then(|id| self.monitors[&id].last_triggered_at);
        let mut rule = MonitorRule {
            id: id.unwrap_or(0),
            status: if definition.enabled {
                "waiting"
            } else {
                "disabled"
            }
            .into(),
            definition,
            last_triggered_at,
            message: String::new(),
        };
        rule.id = self
            .db
            .save_automation_record(
                "monitor",
                id,
                &serde_json::to_string(&rule).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
        self.watches.remove(&rule.id);
        self.monitors.insert(rule.id, rule.clone());
        Ok(rule)
    }
    pub fn delete(&mut self, kind: &str, id: i64) -> Result<(), String> {
        if kind == "plan" {
            self.stop_plan(id)?;
            self.db
                .delete_automation_record(kind, id)
                .map_err(|e| e.to_string())?;
            self.plans.remove(&id);
        } else if kind == "monitor" {
            self.db
                .delete_automation_record(kind, id)
                .map_err(|e| e.to_string())?;
            self.monitors.remove(&id);
            self.watches.remove(&id);
        } else {
            return Err("Unknown automation record type".into());
        }
        Ok(())
    }
    pub fn ensure_available(&self, mac: &str, channel: Option<u8>) -> Result<(), String> {
        let mac = normalize_mac(mac);
        if self.runs.keys().any(|id| {
            self.plans[id].definition.targets.iter().any(|target| {
                target.mac == mac && channel.is_none_or(|channel| target.channel == channel)
            })
        }) {
            return Err(
                "An automation run controls this outlet; stop the run before manual switching"
                    .into(),
            );
        }
        if self.watches.iter().any(|(id, watch)| {
            watch.pending_off.is_some()
                && self.monitors[id].definition.target.mac == mac
                && channel
                    .is_none_or(|channel| self.monitors[id].definition.target.channel == channel)
        }) {
            return Err("A monitoring shutoff is awaiting confirmation".into());
        }
        Ok(())
    }
    pub fn stop_plan(&mut self, id: i64) -> Result<(), String> {
        let mut plan = self
            .plans
            .get(&id)
            .cloned()
            .ok_or("Schedule no longer exists")?;
        plan.definition.enabled = false;
        plan.next_run_at = None;
        if self.runs.remove(&id).is_some() {
            plan.status = "cancelled".into();
            plan.finished_at = Some(Utc::now().timestamp());
            plan.message = "Run stopped; inspect the last reported outlet state".into();
        }
        self.persist_plan(&plan)?;
        self.plans.insert(id, plan);
        Ok(())
    }
    pub fn pause_targets(&mut self, mac: Option<&str>) -> Result<(), String> {
        let ids: Vec<_> = self
            .plans
            .values()
            .filter(|plan| {
                mac.is_none_or(|mac| {
                    plan.definition
                        .targets
                        .iter()
                        .any(|target| target.mac == normalize_mac(mac))
                })
            })
            .map(|plan| plan.id)
            .collect();
        for id in ids {
            self.stop_plan(id)?;
        }
        Ok(())
    }
    pub fn stop_all(&mut self) -> Result<(), String> {
        self.pause_targets(None)?;
        let ids: Vec<_> = self.monitors.keys().copied().collect();
        for id in ids {
            let mut rule = self.monitors[&id].clone();
            rule.definition.enabled = false;
            if !self
                .watches
                .get(&id)
                .is_some_and(|watch| watch.pending_off.is_some())
            {
                rule.status = "disabled".into();
                self.watches.remove(&id);
            }
            self.persist_monitor(&rule)?;
            self.monitors.insert(id, rule);
        }
        self.changed();
        Ok(())
    }
    pub fn reset(&mut self) {
        self.runs.clear();
        self.watches.clear();
        self.plans.clear();
        self.monitors.clear();
    }
    async fn observations(
        &self,
        targets: &[OutletTarget],
        require_on: bool,
    ) -> Result<Vec<Observation>, String> {
        let _status = self.server.status_gate.lock().await;
        let devices = self.db.get_devices().map_err(|e| e.to_string())?;
        let now = Utc::now().timestamp();
        let mut observations = vec![];
        for target in targets {
            let session = self
                .server
                .sessions
                .read()
                .await
                .get(&target.mac)
                .cloned()
                .ok_or("A selected strip is offline")?;
            let outlet = devices
                .iter()
                .find(|device| device.mac == target.mac)
                .and_then(|device| {
                    device
                        .outlets
                        .iter()
                        .find(|outlet| outlet.channel == target.channel)
                })
                .ok_or("Outlet readings are unavailable")?;
            let age = now - outlet.telemetry_at;
            let fresh = session.telemetry_received.load(Ordering::Acquire)
                && outlet.telemetry_at > 0
                && (-2..=30).contains(&age);
            let protected = !outlet.overload_ok
                || !outlet.overheat_ok
                || !["00", "04"].contains(&outlet.event_code.as_str());
            if require_on && (!fresh || protected) {
                return Err("Power-on requires fresh telemetry and clear protection flags".into());
            }
            observations.push(Observation {
                connection: session.connection_id,
                revision: *session
                    .reports
                    .read()
                    .await
                    .get(&target.channel)
                    .unwrap_or(&0),
                on: outlet.on,
                telemetry_at: outlet.telemetry_at,
                fresh,
                protected,
                power: outlet.power_w,
                temperature: outlet.temperature_c as f64,
            });
        }
        Ok(observations)
    }
    async fn queue(
        &self,
        targets: &[OutletTarget],
        on: bool,
        observations: &[Observation],
    ) -> Result<(), String> {
        // Queue against the exact checked connection; a reconnect cannot inherit this command.
        for (target, observation) in targets.iter().zip(observations) {
            let session = self
                .server
                .sessions
                .read()
                .await
                .get(&target.mac)
                .cloned()
                .ok_or("A selected strip disconnected")?;
            if session.connection_id != observation.connection {
                return Err("Strip reconnected during the run".into());
            }
            session
                .tx
                .try_send(build_onoff_cmd(target.channel, on))
                .map_err(|e| format!("Could not queue relay command: {}", e))?;
        }
        Ok(())
    }
    pub async fn run_now(&mut self, id: i64) -> Result<(), String> {
        let mut plan = self
            .plans
            .get(&id)
            .cloned()
            .ok_or("Schedule no longer exists")?;
        if self.runs.contains_key(&id) {
            return Err("Scenario is already running".into());
        }
        for target in &plan.definition.targets {
            self.ensure_available(&target.mac, Some(target.channel))?;
        }
        let observations = self
            .observations(&plan.definition.targets, plan.definition.steps[0].on)
            .await?;
        plan.status = "running".into();
        plan.current_step = 0;
        plan.completed_cycles = 0;
        plan.started_at = Some(Utc::now().timestamp());
        plan.finished_at = None;
        plan.message = "Waiting for relay confirmation".into();
        // Persist before any physical command. A restart marks this run interrupted.
        self.persist_plan(&plan)?;
        self.plans.insert(id, plan.clone());
        if let Err(error) = self
            .queue(
                &plan.definition.targets,
                plan.definition.steps[0].on,
                &observations,
            )
            .await
        {
            self.finish(id, "failed", &error)?;
            return Err(error);
        }
        self.runs.insert(
            id,
            ActiveRun {
                observations,
                step: 0,
                cycle: 0,
                confirmation_deadline: Instant::now() + Duration::from_secs(12),
                hold_until: None,
            },
        );
        let _ = self.db.log_activity(
            &plan.definition.targets[0].mac,
            "scenario_started",
            &format!(
                "{}: {} outlets, {} cycles",
                plan.definition.name,
                plan.definition.targets.len(),
                plan.definition.repetitions
            ),
        );
        self.changed();
        Ok(())
    }
    fn finish(&mut self, id: i64, status: &str, message: &str) -> Result<(), String> {
        self.runs.remove(&id);
        let mut plan = self.plans[&id].clone();
        plan.status = status.into();
        plan.message = message.into();
        plan.finished_at = Some(Utc::now().timestamp());
        self.persist_plan(&plan)?;
        let _ = self.db.log_activity(
            &plan.definition.targets[0].mac,
            &format!("scenario_{}", status),
            &format!("{}: {}", plan.definition.name, message),
        );
        self.plans.insert(id, plan);
        self.changed();
        Ok(())
    }
    async fn advance(&mut self, id: i64) -> Result<(), String> {
        let mut run = self.runs.remove(&id).unwrap();
        let mut plan = self.plans[&id].clone();
        let current = match self.observations(&plan.definition.targets, false).await {
            Ok(current) => current,
            Err(error) => return self.finish(id, "failed", &error),
        };
        if current
            .iter()
            .zip(&run.observations)
            .any(|(now, before)| now.connection != before.connection)
        {
            return self.finish(
                id,
                "failed",
                "Strip reconnected; run stopped without resuming",
            );
        }
        if current.iter().any(|o| o.protected) && plan.definition.steps[run.step].on {
            return self.finish(id, "failed", "Protection fault reported; run stopped");
        }
        if run.hold_until.is_none() {
            let confirmed = current.iter().zip(&run.observations).all(|(now, before)| {
                now.revision > before.revision && now.on == plan.definition.steps[run.step].on
            });
            if !confirmed {
                if Instant::now() >= run.confirmation_deadline {
                    return self.finish(id, "failed", "Relay state was not confirmed within 12 seconds; inspect the outlet before retrying");
                }
                self.runs.insert(id, run);
                return Ok(());
            }
            run.hold_until = Some(
                Instant::now()
                    + Duration::from_secs(plan.definition.steps[run.step].duration_sec as u64),
            );
            plan.message = "Holding confirmed outlet state".into();
            self.persist_plan(&plan)?;
            self.plans.insert(id, plan.clone());
        }
        if current.iter().any(|o| !o.fresh) && plan.definition.steps[run.step].on {
            return self.finish(id, "failed", "Telemetry became stale; run stopped");
        }
        if current
            .iter()
            .any(|o| o.on != plan.definition.steps[run.step].on)
        {
            return self.finish(
                id,
                "failed",
                "Outlet state changed outside the scenario; run stopped",
            );
        }
        if Instant::now() < run.hold_until.unwrap() {
            self.runs.insert(id, run);
            return Ok(());
        }
        run.step += 1;
        if run.step == plan.definition.steps.len() {
            run.step = 0;
            run.cycle += 1;
            plan.completed_cycles = run.cycle;
        }
        if run.cycle >= plan.definition.repetitions {
            self.plans.insert(id, plan);
            return self.finish(
                id,
                "completed",
                "All scenario steps were confirmed and completed",
            );
        }
        let next = match self
            .observations(&plan.definition.targets, plan.definition.steps[run.step].on)
            .await
        {
            Ok(next) => next,
            Err(error) => return self.finish(id, "failed", &error),
        };
        if next
            .iter()
            .zip(&run.observations)
            .any(|(now, before)| now.connection != before.connection)
        {
            return self.finish(
                id,
                "failed",
                "Strip reconnected; run stopped without resuming",
            );
        }
        plan.current_step = run.step;
        plan.message = "Waiting for relay confirmation".into();
        self.persist_plan(&plan)?;
        self.plans.insert(id, plan.clone());
        if let Err(error) = self
            .queue(
                &plan.definition.targets,
                plan.definition.steps[run.step].on,
                &next,
            )
            .await
        {
            return self.finish(id, "failed", &error);
        }
        run.observations = next;
        run.hold_until = None;
        run.confirmation_deadline = Instant::now() + Duration::from_secs(12);
        self.runs.insert(id, run);
        Ok(())
    }
    async fn tick(&mut self) -> Result<(), String> {
        let now = Utc::now().timestamp();
        if now - self.last_tick_at > 30 || now < self.last_tick_at - 2 {
            let ids: Vec<_> = self.runs.keys().copied().collect();
            for id in ids {
                self.finish(
                    id,
                    "interrupted",
                    "Controller timing was interrupted; inspect the outlet before restarting",
                )?;
            }
            for watch in self.watches.values_mut() {
                watch.since = None;
                watch.last_at = 0;
            }
        }
        self.last_tick_at = now;
        let due: Vec<_> = self
            .plans
            .values()
            .filter(|plan| plan.definition.enabled && plan.next_run_at.is_some_and(|at| at <= now))
            .map(|plan| plan.id)
            .collect();
        for id in due {
            let mut plan = self.plans[&id].clone();
            let late = now - plan.next_run_at.unwrap() > 30;
            plan.next_run_at = next_occurrence(&plan.definition.trigger, now);
            if matches!(plan.definition.trigger, Trigger::Once { .. }) {
                plan.definition.enabled = false;
            }
            self.persist_plan(&plan)?;
            self.plans.insert(id, plan);
            if self.runs.contains_key(&id) {
                continue;
            }
            if late {
                self.finish(
                    id,
                    "missed",
                    "Start time missed by more than 30 seconds; run skipped",
                )?;
            } else if let Err(error) = self.run_now(id).await {
                self.finish(id, "failed", &error)?;
            }
        }
        let ids: Vec<_> = self.runs.keys().copied().collect();
        for id in ids {
            self.advance(id).await?;
        }
        let ids: Vec<_> = self.monitors.keys().copied().collect();
        for id in ids {
            self.check_monitor(id).await?;
        }
        Ok(())
    }
    async fn check_monitor(&mut self, id: i64) -> Result<(), String> {
        let mut rule = self.monitors[&id].clone();
        if !rule.definition.enabled
            && !self
                .watches
                .get(&id)
                .is_some_and(|watch| watch.pending_off.is_some())
        {
            return Ok(());
        }
        let target = &rule.definition.target;
        let mut watch = self.watches.remove(&id).unwrap_or_default();
        let observation = self
            .observations(std::slice::from_ref(target), false)
            .await
            .ok()
            .and_then(|mut o| o.pop());
        if let Some((before, deadline)) = &watch.pending_off {
            let outcome = match &observation {
                Some(now) if now.connection != before.connection => {
                    Some(("failed", "Strip reconnected before shutoff confirmation"))
                }
                Some(now) if now.revision > before.revision && !now.on => {
                    Some(("triggered", "Automatic shutoff confirmed by the strip"))
                }
                _ if Instant::now() >= *deadline => Some((
                    "failed",
                    "Automatic shutoff was not confirmed; inspect the outlet",
                )),
                _ => None,
            };
            if let Some((status, message)) = outcome {
                rule.status = status.into();
                rule.message = message.into();
                watch.pending_off = None;
                self.persist_monitor(&rule)?;
                let _ = self
                    .db
                    .log_activity(&target.mac, "monitor_shutoff_result", message);
                self.changed();
            } else {
                self.watches.insert(id, watch);
                return Ok(());
            }
        }
        if !rule.definition.enabled {
            self.monitors.insert(id, rule);
            self.watches.insert(id, watch);
            return Ok(());
        }
        let Some(observation) = observation.filter(|o| o.fresh) else {
            watch.since = None;
            watch.last_at = 0;
            rule.status = "waiting".into();
            self.monitors.insert(id, rule);
            self.watches.insert(id, watch);
            return Ok(());
        };
        if observation.connection != watch.connection
            || observation.telemetry_at - watch.last_at > 30
        {
            watch.since = None;
        }
        watch.connection = observation.connection;
        if observation.telemetry_at <= watch.last_at {
            self.monitors.insert(id, rule);
            self.watches.insert(id, watch);
            return Ok(());
        }
        watch.last_at = observation.telemetry_at;
        let value = if rule.definition.metric == "power" {
            observation.power
        } else {
            observation.temperature
        };
        let matches = observation.on
            && if rule.definition.comparison == "above" {
                value > rule.definition.threshold
            } else {
                value < rule.definition.threshold
            };
        if !matches {
            watch.since = None;
            watch.latched = false;
            rule.status = "watching".into();
        } else if !watch.latched {
            let since = *watch.since.get_or_insert(observation.telemetry_at);
            rule.status = "timing".into();
            if observation.telemetry_at - since >= rule.definition.duration_sec as i64 {
                watch.latched = true;
                rule.status = "triggered".into();
                rule.last_triggered_at = Some(Utc::now().timestamp());
                rule.message = format!(
                    "{}: observed {} {} {} for {} seconds",
                    rule.definition.name,
                    value,
                    rule.definition.comparison,
                    rule.definition.threshold,
                    rule.definition.duration_sec
                );
                if rule.definition.action == "off" {
                    // Cutoff preempts any scenario using this outlet, including future schedules.
                    self.pause_targets(Some(&target.mac))?;
                    self.persist_monitor(&rule)?;
                    match self
                        .queue(
                            std::slice::from_ref(target),
                            false,
                            std::slice::from_ref(&observation),
                        )
                        .await
                    {
                        Ok(()) => {
                            watch.pending_off = Some((
                                observation.clone(),
                                Instant::now() + Duration::from_secs(12),
                            ));
                            rule.status = "switching_off".into();
                        }
                        Err(error) => {
                            rule.status = "failed".into();
                            rule.message = error;
                        }
                    }
                    // Automatic cutoff is one-shot; explicitly re-enable after inspecting equipment.
                    rule.definition.enabled = false;
                }
                self.persist_monitor(&rule)?;
                let _ = self
                    .db
                    .log_activity(&target.mac, "monitor_triggered", &rule.message);
                self.changed();
            }
        }
        self.monitors.insert(id, rule);
        self.watches.insert(id, watch);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mttl::parse_getinfo;
    use crate::server::DeviceSession;
    use std::sync::atomic::AtomicBool;
    use tokio::sync::{RwLock, mpsc, watch};
    const MAC: &str = "001122334455";

    fn definition() -> PlanDefinition {
        PlanDefinition {
            name: "Cycle test".into(),
            targets: vec![OutletTarget {
                mac: MAC.into(),
                channel: 1,
            }],
            steps: vec![
                ScenarioStep {
                    on: true,
                    duration_sec: 3,
                },
                ScenarioStep {
                    on: false,
                    duration_sec: 10,
                },
            ],
            repetitions: 2,
            trigger: Trigger::Manual,
            enabled: true,
        }
    }
    fn monitor(action: &str) -> MonitorDefinition {
        MonitorDefinition {
            name: "Standby monitor".into(),
            target: OutletTarget {
                mac: MAC.into(),
                channel: 1,
            },
            metric: "power".into(),
            comparison: "below".into(),
            threshold: 3.0,
            duration_sec: 10,
            action: action.into(),
            enabled: true,
        }
    }
    async fn fixture() -> (AutomationEngine, Arc<DeviceSession>, mpsc::Receiver<String>) {
        let db = Arc::new(Database::new(":memory:".into()).unwrap());
        db.register_device(MAC, "192.0.2.1", "Bench supply")
            .unwrap();
        let frame = "up:getinfo:1:0;on;3;on;on;10;00000000;00000000;00000000;off;00;25:2:0;off;3;on;on;0;00000000;00000000;00000000;off;00;25:3:0;off;3;on;on;0;00000000;00000000;00000000;off;00;25:4:0;off;3;on;on;0;00000000;00000000;00000000;off;00;25";
        db.save_telemetry_frame(MAC, &parse_getinfo(frame).unwrap(), Some(frame), 1)
            .unwrap();
        let server = Arc::new(ServerState::new(db.clone()));
        let (tx, rx) = mpsc::channel(32);
        let session = Arc::new(DeviceSession {
            tx,
            telemetry_received: AtomicBool::new(true),
            reports: RwLock::new(HashMap::from([(1, 1)])),
            connection_id: 1,
            disconnect_tx: watch::channel(false).0,
            voltage_v: RwLock::new(None),
            rssi_dbm: RwLock::new(None),
        });
        server
            .sessions
            .write()
            .await
            .insert(MAC.into(), session.clone());
        (AutomationEngine::new(db, server).unwrap(), session, rx)
    }
    async fn acknowledge(state: &AutomationState, session: &DeviceSession, on: bool) {
        state.db.save_outlet_relay_state(MAC, 1, on).unwrap();
        *session.reports.write().await.entry(1).or_default() += 1;
    }
    #[test]
    fn input_validation_rejects_duplicate_targets_and_unbounded_loops() {
        let mut d = definition();
        d.targets.push(d.targets[0].clone());
        assert!(validate_plan(&mut d, 0).unwrap_err().contains("once"));
        d = definition();
        d.repetitions = 0;
        assert!(validate_plan(&mut d, 0).is_err());
        d = definition();
        d.steps[0].duration_sec = 0;
        assert!(validate_plan(&mut d, 0).is_err());
        d = definition();
        d.steps = vec![ScenarioStep {
            on: false,
            duration_sec: 0,
        }];
        d.repetitions = 1;
        assert!(validate_plan(&mut d, 0).is_ok());
        d = definition();
        d.trigger = Trigger::Weekly {
            time: "25:00".into(),
            weekdays: vec![1],
        };
        assert!(validate_plan(&mut d, 0).is_err());
        let mut m = monitor("off");
        m.threshold = f64::NAN;
        assert!(validate_monitor(&mut m).is_err());
        m = monitor("off");
        m.duration_sec = 3;
        assert!(validate_monitor(&mut m).is_err());
    }
    #[tokio::test]
    async fn reconnects_and_external_relay_changes_stop_runs_without_further_commands() {
        let (engine, session, mut rx) = fixture().await;
        let mut state = engine.state.lock().await;
        let id = state.save_plan(None, definition()).unwrap().id;
        state.run_now(id).await.unwrap();
        rx.recv().await.unwrap();
        acknowledge(&state, &session, true).await;
        state.advance(id).await.unwrap();
        acknowledge(&state, &session, false).await;
        state.advance(id).await.unwrap();
        assert_eq!(state.plans[&id].status, "failed");
        assert!(state.plans[&id].message.contains("outside"));
        assert!(rx.try_recv().is_err());
        state.run_now(id).await.unwrap();
        rx.recv().await.unwrap();
        state.runs.get_mut(&id).unwrap().observations[0].connection = 999;
        state.advance(id).await.unwrap();
        assert!(state.plans[&id].message.contains("reconnected"));
        assert!(rx.try_recv().is_err());
    }
    #[tokio::test]
    async fn stop_all_disables_monitoring_and_cutoff_timeouts_do_not_claim_success() {
        let (engine, _, mut rx) = fixture().await;
        let mut state = engine.state.lock().await;
        let rule = state.save_monitor(None, monitor("off")).unwrap().id;
        state.check_monitor(rule).await.unwrap();
        let now = Utc::now().timestamp();
        let watch = state.watches.get_mut(&rule).unwrap();
        watch.last_at = now - 10;
        watch.since = Some(now - 10);
        state.check_monitor(rule).await.unwrap();
        rx.recv().await.unwrap();
        state
            .watches
            .get_mut(&rule)
            .unwrap()
            .pending_off
            .as_mut()
            .unwrap()
            .1 = Instant::now() - Duration::from_secs(1);
        state.check_monitor(rule).await.unwrap();
        assert_eq!(state.monitors[&rule].status, "failed");
        assert!(state.monitors[&rule].message.contains("not confirmed"));
        let other = state.save_monitor(None, monitor("alert")).unwrap().id;
        state.stop_all().unwrap();
        assert!(!state.monitors[&other].definition.enabled);
        assert_eq!(state.monitors[&other].status, "disabled");
        assert!(rx.try_recv().is_err());
    }
    #[test]
    fn weekly_occurrence_uses_selected_local_weekday_and_does_not_replay() {
        let now = Local::now()
            .date_naive()
            .and_time(NaiveTime::from_hms_opt(12, 0, 0).unwrap());
        let at = Local.from_local_datetime(&now).earliest().unwrap();
        let trigger = Trigger::Weekly {
            time: "12:01".into(),
            weekdays: vec![at.weekday().number_from_monday()],
        };
        assert_eq!(
            next_occurrence(&trigger, at.timestamp()),
            Some(at.timestamp() + 60)
        );
        let next = next_occurrence(&trigger, at.timestamp() + 60).unwrap();
        assert!(next > at.timestamp() + 6 * 86400);
        assert_eq!(next_occurrence(&Trigger::Once { at: 500 }, 500), None);
    }
    #[tokio::test]
    async fn holds_start_only_after_new_confirmation_and_exact_cycles_complete() {
        let (engine, session, mut rx) = fixture().await;
        let mut state = engine.state.lock().await;
        let id = state.save_plan(None, definition()).unwrap().id;
        state.run_now(id).await.unwrap();
        assert_eq!(rx.recv().await.unwrap(), "up:onoff:1:on\r\n");
        state.advance(id).await.unwrap();
        assert!(
            state.runs[&id].hold_until.is_none(),
            "cached on state is not acknowledgement"
        );
        assert!(state.ensure_available(MAC, Some(1)).is_err());
        assert!(state.ensure_available(MAC, Some(2)).is_ok());
        for (index, on) in [true, false, true, false].into_iter().enumerate() {
            acknowledge(&state, &session, on).await;
            state.advance(id).await.unwrap();
            assert!(state.runs[&id].hold_until.unwrap() > Instant::now());
            state.runs.get_mut(&id).unwrap().hold_until =
                Some(Instant::now() - Duration::from_secs(1));
            state.advance(id).await.unwrap();
            if index < 3 {
                assert_eq!(rx.recv().await.unwrap(), build_onoff_cmd(1, !on));
            }
        }
        assert_eq!(state.plans[&id].status, "completed");
        assert_eq!(state.plans[&id].completed_cycles, 2);
        assert!(state.runs.is_empty());
        assert!(state.ensure_available(MAC, Some(1)).is_ok());
    }
    #[tokio::test]
    async fn timeout_stop_overlap_and_offline_never_advance() {
        let (engine, _, mut rx) = fixture().await;
        let mut state = engine.state.lock().await;
        let id = state.save_plan(None, definition()).unwrap().id;
        let other = state.save_plan(None, definition()).unwrap().id;
        state.run_now(id).await.unwrap();
        rx.recv().await.unwrap();
        assert!(state.run_now(other).await.is_err());
        state.runs.get_mut(&id).unwrap().confirmation_deadline =
            Instant::now() - Duration::from_secs(1);
        state.advance(id).await.unwrap();
        assert_eq!(state.plans[&id].status, "failed");
        assert!(rx.try_recv().is_err());
        state.run_now(id).await.unwrap();
        rx.recv().await.unwrap();
        state.stop_plan(id).unwrap();
        state.tick().await.unwrap();
        assert_eq!(state.plans[&id].status, "cancelled");
        assert!(rx.try_recv().is_err());
        state.server.sessions.write().await.clear();
        assert!(state.run_now(id).await.unwrap_err().contains("offline"));
    }
    #[tokio::test]
    async fn fresh_protection_data_is_required_for_on_but_off_remains_available() {
        let (engine, session, mut rx) = fixture().await;
        let mut state = engine.state.lock().await;
        let id = state.save_plan(None, definition()).unwrap().id;
        session.telemetry_received.store(false, Ordering::Release);
        assert!(state.run_now(id).await.unwrap_err().contains("fresh"));
        let mut off = definition();
        off.steps = vec![ScenarioStep {
            on: false,
            duration_sec: 0,
        }];
        off.repetitions = 1;
        let off_id = state.save_plan(None, off).unwrap().id;
        state.run_now(off_id).await.unwrap();
        assert_eq!(rx.recv().await.unwrap(), "up:onoff:1:off\r\n");
    }
    #[tokio::test]
    async fn restart_interrupts_runs_and_skips_missed_one_shot_schedules() {
        let (engine, _, mut rx) = fixture().await;
        let mut state = engine.state.lock().await;
        let id = state.save_plan(None, definition()).unwrap().id;
        state.run_now(id).await.unwrap();
        rx.recv().await.unwrap();
        let mut scheduled = definition();
        scheduled.trigger = Trigger::Once {
            at: Utc::now().timestamp() + 60,
        };
        let once = state.save_plan(None, scheduled).unwrap().id;
        let mut plan = state.plans[&once].clone();
        plan.next_run_at = Some(Utc::now().timestamp() - 60);
        state.persist_plan(&plan).unwrap();
        let reloaded = AutomationEngine::new(state.db.clone(), state.server.clone()).unwrap();
        let next = reloaded.state.lock().await;
        assert_eq!(next.plans[&id].status, "interrupted");
        assert_eq!(next.plans[&once].status, "missed");
        assert!(!next.plans[&once].definition.enabled);
        assert!(next.plans[&once].next_run_at.is_none());
        assert!(next.runs.is_empty());
        assert!(rx.try_recv().is_err());
    }
    #[tokio::test]
    async fn automatic_cutoff_preempts_scenarios_and_requires_new_off_confirmation() {
        let (engine, session, mut rx) = fixture().await;
        let mut state = engine.state.lock().await;
        let plan = state.save_plan(None, definition()).unwrap().id;
        state.run_now(plan).await.unwrap();
        rx.recv().await.unwrap();
        let rule = state.save_monitor(None, monitor("off")).unwrap().id;
        state.check_monitor(rule).await.unwrap();
        assert_eq!(state.monitors[&rule].status, "timing");
        assert!(rx.try_recv().is_err());
        let now = Utc::now().timestamp();
        let watch = state.watches.get_mut(&rule).unwrap();
        watch.last_at = now - 10;
        watch.since = Some(now - 10);
        state.check_monitor(rule).await.unwrap();
        assert_eq!(rx.recv().await.unwrap(), "up:onoff:1:off\r\n");
        assert!(!state.monitors[&rule].definition.enabled);
        assert_eq!(state.monitors[&rule].status, "switching_off");
        assert_eq!(state.plans[&plan].status, "cancelled");
        assert!(!state.plans[&plan].definition.enabled);
        assert!(state.ensure_available(MAC, Some(1)).is_err());
        state.check_monitor(rule).await.unwrap();
        assert_eq!(state.monitors[&rule].status, "switching_off");
        acknowledge(&state, &session, false).await;
        state.check_monitor(rule).await.unwrap();
        assert_eq!(state.monitors[&rule].status, "triggered");
        assert!(state.monitors[&rule].message.contains("confirmed"));
        assert!(state.ensure_available(MAC, Some(1)).is_ok());
    }
    #[tokio::test]
    async fn alerts_latch_and_gaps_reset_sustained_condition_timers() {
        let (engine, _, mut rx) = fixture().await;
        let mut state = engine.state.lock().await;
        let rule = state.save_monitor(None, monitor("alert")).unwrap().id;
        state.check_monitor(rule).await.unwrap();
        let now = Utc::now().timestamp();
        let watch = state.watches.get_mut(&rule).unwrap();
        watch.last_at = now - 31;
        watch.since = Some(now - 100);
        state.check_monitor(rule).await.unwrap();
        assert!(state.monitors[&rule].last_triggered_at.is_none());
        assert_eq!(state.watches[&rule].since, Some(now));
        let watch = state.watches.get_mut(&rule).unwrap();
        watch.last_at = now - 10;
        watch.since = Some(now - 10);
        state.check_monitor(rule).await.unwrap();
        assert!(state.monitors[&rule].last_triggered_at.is_some());
        assert!(state.monitors[&rule].definition.enabled);
        assert_eq!(
            state
                .db
                .get_activity_logs(100)
                .unwrap()
                .iter()
                .filter(|log| log.event_type == "monitor_triggered")
                .count(),
            1
        );
        state.watches.get_mut(&rule).unwrap().last_at = now - 10;
        state.check_monitor(rule).await.unwrap();
        assert_eq!(
            state
                .db
                .get_activity_logs(100)
                .unwrap()
                .iter()
                .filter(|log| log.event_type == "monitor_triggered")
                .count(),
            1
        );
        assert!(rx.try_recv().is_err());
    }
    #[tokio::test]
    async fn late_schedules_and_controller_suspension_do_not_switch_equipment() {
        let (engine, _, mut rx) = fixture().await;
        let mut state = engine.state.lock().await;
        let mut d = definition();
        d.trigger = Trigger::Once {
            at: Utc::now().timestamp() + 60,
        };
        let id = state.save_plan(None, d).unwrap().id;
        state.plans.get_mut(&id).unwrap().next_run_at = Some(Utc::now().timestamp() - 31);
        state.tick().await.unwrap();
        assert_eq!(state.plans[&id].status, "missed");
        assert!(rx.try_recv().is_err());
        state.run_now(id).await.unwrap();
        rx.recv().await.unwrap();
        state.last_tick_at = Utc::now().timestamp() - 40;
        state.tick().await.unwrap();
        assert_eq!(state.plans[&id].status, "interrupted");
        assert!(rx.try_recv().is_err());
    }
    #[tokio::test]
    async fn resetting_database_removes_persisted_automation() {
        let (engine, _, _) = fixture().await;
        let mut state = engine.state.lock().await;
        state.save_plan(None, definition()).unwrap();
        state.save_monitor(None, monitor("alert")).unwrap();
        state
            .db
            .clear_data(&crate::types::ClearDataKind::Database, None, None)
            .unwrap();
        state.reset();
        assert!(state.overview().plans.is_empty());
        let reloaded = AutomationEngine::new(state.db.clone(), state.server.clone()).unwrap();
        assert!(reloaded.state.lock().await.overview().monitors.is_empty());
    }
}
