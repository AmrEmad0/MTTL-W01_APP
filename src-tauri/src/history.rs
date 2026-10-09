use crate::types::*;
use std::collections::{BTreeMap, HashMap};

pub const MAX_INTERVAL_SECONDS: i64 = 30;
#[derive(Default)]
struct Stats {
    count: u64,
    sum: f64,
    sum_squared: f64,
    minimum: f64,
    peak: f64,
    temperature: i32,
    energy: f64,
    intervals: u64,
    resets: u64,
    gaps: u64,
}
impl Stats {
    fn reading(&mut self, power: f64, temperature: i32) {
        self.count += 1;
        self.sum += power;
        self.sum_squared += power * power;
        self.minimum = if self.count == 1 {
            power
        } else {
            self.minimum.min(power)
        };
        self.peak = self.peak.max(power);
        if self.count == 1 || temperature > self.temperature {
            self.temperature = temperature;
        }
    }
    fn energy(&self) -> Option<f64> {
        (self.intervals > 0).then_some(self.energy)
    }
}
#[derive(Default)]
struct Bucket {
    frames: Stats,
    energy: [Stats; 4],
}
pub struct HistoryBuilder {
    channel: Option<u8>,
    bucket_seconds: i64,
    buckets: BTreeMap<i64, Bucket>,
    outlets: [Stats; 4],
    previous: HashMap<u8, (i64, f64)>,
    previous_behavior: HashMap<u8, (i64, bool, f64)>,
    observed_seconds: u64,
    relay_on_seconds: u64,
    standby_seconds: u64,
    relay_changes: u64,
    frame_key: Option<(i64, i64)>,
    frame: Vec<(u8, f64, i32)>,
    frame_at: i64,
    frames: Stats,
    first_at: Option<i64>,
    last_at: Option<i64>,
    records: u64,
}
impl HistoryBuilder {
    pub fn new(channel: Option<u8>, bucket_seconds: i64) -> Self {
        Self {
            channel,
            bucket_seconds,
            buckets: BTreeMap::new(),
            outlets: Default::default(),
            previous: HashMap::new(),
            previous_behavior: HashMap::new(),
            observed_seconds: 0,
            relay_on_seconds: 0,
            standby_seconds: 0,
            relay_changes: 0,
            frame_key: None,
            frame: vec![],
            frame_at: 0,
            frames: Stats::default(),
            first_at: None,
            last_at: None,
            records: 0,
        }
    }
    pub fn push(&mut self, record: &TelemetryRecord) {
        if !(1..=4).contains(&record.channel) {
            return;
        }
        let key = (record.recorded_at, record.sample_id.unwrap_or(0));
        if self.frame_key != Some(key) {
            self.finish_frame();
            self.frame_key = Some(key);
            self.frame_at = record.recorded_at;
        }
        self.frame
            .push((record.channel, record.power_w, record.temperature_c));
        self.first_at.get_or_insert(record.recorded_at);
        self.last_at = Some(record.recorded_at);
        self.records += 1;
        let index = (record.channel - 1) as usize;
        self.outlets[index].reading(record.power_w, record.temperature_c);
        if let Some((at, on, power)) = self.previous_behavior.insert(
            record.channel,
            (record.recorded_at, record.relay_on, record.power_w),
        ) {
            let elapsed = record.recorded_at - at;
            if elapsed > 0 && elapsed <= MAX_INTERVAL_SECONDS {
                self.observed_seconds += elapsed as u64;
                if record.relay_on != on {
                    self.relay_changes += 1;
                }
                if record.relay_on && on {
                    self.relay_on_seconds += elapsed as u64;
                    if record.power_w <= 3.0 && power <= 3.0 {
                        self.standby_seconds += elapsed as u64;
                    }
                }
            }
        }
        if let Some((timestamp, energy)) = self
            .previous
            .insert(record.channel, (record.recorded_at, record.energy_kwh))
        {
            let delta = record.energy_kwh - energy;
            let elapsed = record.recorded_at - timestamp;
            if delta < -0.0000001 {
                self.outlets[index].resets += 1;
            } else if elapsed > MAX_INTERVAL_SECONDS {
                self.outlets[index].gaps += 1;
            } else if elapsed >= 0 {
                let measured = delta.max(0.0);
                self.outlets[index].energy += measured;
                self.outlets[index].intervals += 1;
                let bucket = self
                    .buckets
                    .entry(record.recorded_at.div_euclid(self.bucket_seconds) * self.bucket_seconds)
                    .or_default();
                bucket.energy[index].energy += measured;
                bucket.energy[index].intervals += 1;
            }
        }
    }
    fn finish_frame(&mut self) {
        let expected = self
            .channel
            .map(|channel| vec![channel])
            .unwrap_or_else(|| vec![1, 2, 3, 4]);
        // Do not turn partial legacy records into a whole-strip reading.
        if self.frame.len() == expected.len()
            && expected
                .iter()
                .all(|channel| self.frame.iter().filter(|item| item.0 == *channel).count() == 1)
        {
            let power = self.frame.iter().map(|item| item.1).sum::<f64>();
            let temperature = self.frame.iter().map(|item| item.2).max().unwrap();
            self.frames.reading(power, temperature);
            self.buckets
                .entry(self.frame_at.div_euclid(self.bucket_seconds) * self.bucket_seconds)
                .or_default()
                .frames
                .reading(power, temperature);
        }
        self.frame.clear();
    }
    pub fn finish(mut self, names: &[(u8, String)]) -> HistoryChart {
        self.finish_frame();
        let channels = self
            .channel
            .map(|channel| vec![(channel - 1) as usize])
            .unwrap_or_else(|| vec![0, 1, 2, 3]);
        let complete_energy = channels
            .iter()
            .all(|index| self.outlets[*index].intervals > 0);
        HistoryChart {
            bucket_seconds: self.bucket_seconds,
            summary: HistorySummary {
                observed_seconds: self.observed_seconds,
                relay_on_seconds: self.relay_on_seconds,
                standby_seconds: self.standby_seconds,
                relay_changes: self.relay_changes,
                minimum_power_w: (self.frames.count > 0).then_some(self.frames.minimum),
                power_stddev_w: (self.frames.count > 0).then(|| {
                    (self.frames.sum_squared / self.frames.count as f64
                        - (self.frames.sum / self.frames.count as f64).powi(2))
                    .max(0.0)
                    .sqrt()
                }),
                record_count: self.records,
                sample_count: self.frames.count,
                observed_energy_kwh: complete_energy.then(|| {
                    channels
                        .iter()
                        .map(|index| self.outlets[*index].energy)
                        .sum()
                }),
                average_power_w: (self.frames.count > 0)
                    .then(|| self.frames.sum / self.frames.count as f64),
                peak_power_w: (self.frames.count > 0).then_some(self.frames.peak),
                max_temperature_c: (self.frames.count > 0).then_some(self.frames.temperature),
                counter_resets: channels
                    .iter()
                    .map(|index| self.outlets[*index].resets)
                    .sum(),
                gap_intervals: channels.iter().map(|index| self.outlets[*index].gaps).sum(),
                first_at: self.first_at,
                last_at: self.last_at,
            },
            points: self
                .buckets
                .into_iter()
                .map(|(timestamp, bucket)| HistoryPoint {
                    timestamp,
                    average_power_w: (bucket.frames.count > 0)
                        .then(|| bucket.frames.sum / bucket.frames.count as f64),
                    peak_power_w: (bucket.frames.count > 0).then_some(bucket.frames.peak),
                    temperature_c: (bucket.frames.count > 0).then_some(bucket.frames.temperature),
                    energy_kwh: channels
                        .iter()
                        .all(|index| bucket.energy[*index].intervals > 0)
                        .then(|| {
                            channels
                                .iter()
                                .map(|index| bucket.energy[*index].energy)
                                .sum()
                        }),
                    samples: bucket.frames.count,
                })
                .collect(),
            outlets: channels
                .iter()
                .map(|index| {
                    let stats = &self.outlets[*index];
                    let channel = (*index + 1) as u8;
                    OutletUsage {
                        channel,
                        name: names
                            .iter()
                            .find(|item| item.0 == channel)
                            .map(|item| item.1.clone())
                            .unwrap_or_else(|| format!("Outlet {}", channel)),
                        observed_energy_kwh: stats.energy(),
                        average_power_w: (stats.count > 0).then(|| stats.sum / stats.count as f64),
                        peak_power_w: (stats.count > 0).then_some(stats.peak),
                        records: stats.count,
                    }
                })
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn reading(channel: u8, at: i64, sample: i64, power: f64, energy: f64) -> TelemetryRecord {
        TelemetryRecord {
            id: sample * 4 + channel as i64,
            sample_id: Some(sample),
            mac: "001122334455".into(),
            channel,
            relay_on: true,
            power_w: power,
            energy_kwh: energy,
            secondary_energy_kwh: 0.0,
            temperature_c: 25 + channel as i32,
            event_code: "00".into(),
            recorded_at: at,
            raw_frame: None,
            energy_budget_kwh: None,
            overload_ok: None,
            overheat_ok: None,
            countdown_sec: None,
            standby_threshold_w: None,
            standby_cutoff_enabled: None,
        }
    }
    #[test]
    fn whole_strip_peak_uses_simultaneous_frames_and_usage_sums_counters() {
        let mut builder = HistoryBuilder::new(None, 10);
        for channel in 1..=4 {
            builder.push(&reading(
                channel,
                1000,
                1,
                if channel == 1 { 100.0 } else { 0.0 },
                1.0,
            ));
        }
        for channel in 1..=4 {
            builder.push(&reading(
                channel,
                1010,
                2,
                if channel == 2 { 100.0 } else { 0.0 },
                1.01,
            ));
        }
        let result = builder.finish(&[(1, "Pump".into())]);
        assert_eq!(result.summary.sample_count, 2);
        assert_eq!(result.summary.peak_power_w, Some(100.0));
        assert_eq!(result.summary.average_power_w, Some(100.0));
        assert!((result.summary.observed_energy_kwh.unwrap() - 0.04).abs() < 1e-9);
        assert_eq!(result.outlets[0].name, "Pump");
    }
    #[test]
    fn gaps_and_counter_resets_do_not_create_fake_usage() {
        let mut builder = HistoryBuilder::new(Some(1), 10);
        for (sample, at, energy) in [
            (1, 1000, 1.0),
            (2, 1010, 1.01),
            (3, 2000, 4.0),
            (4, 2010, 0.1),
            (5, 2020, 0.12),
        ] {
            builder.push(&reading(1, at, sample, 50.0, energy));
        }
        let result = builder.finish(&[]);
        assert!((result.summary.observed_energy_kwh.unwrap() - 0.03).abs() < 1e-9);
        assert_eq!(result.summary.counter_resets, 1);
        assert_eq!(result.summary.gap_intervals, 1);
        assert!(
            result
                .points
                .iter()
                .filter(|point| point.timestamp == 2000 || point.timestamp == 2010)
                .all(|point| point.energy_kwh.is_none())
        );
    }
    #[test]
    fn behavior_statistics_exclude_gaps_and_only_count_agreeing_endpoints() {
        let mut builder = HistoryBuilder::new(Some(1), 10);
        for (sample, at, on, power) in [
            (1, 1000, true, 2.0),
            (2, 1010, true, 3.0),
            (3, 1020, false, 0.0),
            (4, 2000, true, 100.0),
            (5, 2010, true, 200.0),
        ] {
            let mut record = reading(1, at, sample, power, 1.0);
            record.relay_on = on;
            builder.push(&record);
        }
        let result = builder.finish(&[]);
        assert_eq!(result.summary.observed_seconds, 30);
        assert_eq!(result.summary.relay_on_seconds, 20);
        assert_eq!(result.summary.standby_seconds, 10);
        assert_eq!(result.summary.relay_changes, 1);
        assert_eq!(result.summary.minimum_power_w, Some(0.0));
        assert!((result.summary.power_stddev_w.unwrap() - 79.25654547102089).abs() < 0.01);
    }
    #[test]
    fn partial_frames_and_single_counter_readings_remain_unknown() {
        let mut builder = HistoryBuilder::new(None, 10);
        builder.push(&reading(1, 1000, 1, 50.0, 1.0));
        let result = builder.finish(&[]);
        assert_eq!(result.summary.average_power_w, None);
        assert_eq!(result.summary.observed_energy_kwh, None);
        assert_eq!(result.outlets[0].observed_energy_kwh, None);
        assert!(result.points.is_empty());
    }
    #[test]
    fn distinct_frames_in_one_second_are_not_merged() {
        let mut builder = HistoryBuilder::new(None, 10);
        for sample in [1, 2] {
            for channel in 1..=4 {
                builder.push(&reading(channel, 1000, sample, 10.0, sample as f64 * 0.01));
            }
        }
        let result = builder.finish(&[]);
        assert_eq!(result.summary.sample_count, 2);
        assert_eq!(result.summary.average_power_w, Some(40.0));
        assert!((result.summary.observed_energy_kwh.unwrap() - 0.04).abs() < 1e-9);
    }
}
