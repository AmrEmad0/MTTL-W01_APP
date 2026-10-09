import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api";
import type { AutomationOverview, PlanDefinition } from "./types";

export function scenarioHoldSeconds(
  definition: Pick<PlanDefinition, "steps" | "repetitions">,
): number {
  return (
    definition.steps.reduce((sum, step) => sum + step.duration_sec, 0) *
    definition.repetitions
  );
}
export function validateScenario(definition: PlanDefinition): string {
  if (!definition.name.trim() || definition.name.trim().length > 80)
    return "Enter a name of 1–80 characters";
  if (!definition.targets.length || definition.targets.length > 16)
    return "Select between 1 and 16 outlets";
  if (
    !definition.steps.length ||
    definition.steps.length > 32 ||
    !Number.isInteger(definition.repetitions) ||
    definition.repetitions < 1 ||
    definition.repetitions > 10000 ||
    definition.steps.some(
      (step) =>
        !Number.isInteger(step.duration_sec) ||
        step.duration_sec < 0 ||
        step.duration_sec > 86400,
    ) ||
    (definition.steps.some((step) => step.duration_sec === 0) &&
      (definition.steps.length !== 1 || definition.repetitions !== 1)) ||
    scenarioHoldSeconds(definition) > 7 * 86400
  )
    return "Use 1–32 steps, 1–10,000 cycles, and a total hold time up to 7 days";
  if (
    definition.trigger.kind === "once" &&
    definition.enabled &&
    (!Number.isFinite(definition.trigger.at) ||
      definition.trigger.at <= Date.now() / 1000)
  )
    return "Choose a future start time";
  if (
    definition.trigger.kind === "weekly" &&
    (!/^([01]\d|2[0-3]):[0-5]\d$/.test(definition.trigger.time) ||
      !definition.trigger.weekdays.length)
  )
    return "Choose a local time and at least one weekday";
  return "";
}
export function durationLabel(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  return `${(seconds / 3600).toFixed(1)} h`;
}
export function useAutomation(native: boolean) {
  const [data, setData] = useState<AutomationOverview>({
    plans: [],
    monitors: [],
  });
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false),
    locked = useRef(false),
    version = useRef(0);
  const reload = useCallback(async () => {
    const request = ++version.current;
    try {
      const overview = await api.getAutomation();
      if (mounted.current && request === version.current) {
        setData(overview);
        setAvailable(true);
      }
    } catch (e) {
      if (mounted.current && request === version.current) {
        setAvailable(false);
        setError(errorMessage(e));
      }
      throw e;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!native)
      return () => {
        mounted.current = false;
      };
    void reload().catch(() => {});
    const timer = setInterval(() => {
      void reload().catch(() => {});
    }, 2000);
    const requestVersion = version;
    const off = api.onEvent("automation-update", () => {
      void reload().catch(() => {});
    });
    return () => {
      mounted.current = false;
      clearInterval(timer);
      off();
      requestVersion.current++;
    };
  }, [native, reload]);
  const act = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      if (locked.current) return false;
      locked.current = true;
      setBusy(true);
      setError("");
      try {
        await action();
        await reload();
        return true;
      } catch (e) {
        if (mounted.current) setError(errorMessage(e));
        return false;
      } finally {
        locked.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [reload],
  );
  return { data, error, busy, available, reload, act };
}
export type AutomationController = ReturnType<typeof useAutomation>;
