import { localize, useLanguage, setLanguage, applyLanguage, t } from "./i18n";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  lazy,
  Suspense,
} from "react";
import { AlertCircle, CheckCircle2, X, Loader2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, errorMessage, isTauri } from "./api";
import type {
  ClearDataKind,
  DeviceInfo,
  RawLogEvent,
  ServerStatus,
  RemovedDevice,
  ProvisionTarget,
} from "./types";
import { deviceFresh, relayTargetsConfirmed } from "./status";
import { Navbar } from "./components/Navbar";
import { DashboardView } from "./components/DashboardView";
import { useAutomation } from "./automation";

import { initialTheme, applyTheme, type Theme } from "./theme";

const NetworkScannerView = lazy(() =>
  import("./components/NetworkScannerView").then((module) => ({
    default: module.NetworkScannerView,
  })),
);
const ProvisionWizardView = lazy(() =>
  import("./components/ProvisionWizardView").then((module) => ({
    default: module.ProvisionWizardView,
  })),
);
const RawConsoleView = lazy(() =>
  import("./components/RawConsoleView").then((module) => ({
    default: module.RawConsoleView,
  })),
);
const HistoryView = lazy(() =>
  import("./components/HistoryView").then((module) => ({
    default: module.HistoryView,
  })),
);
const DataManagementView = lazy(() =>
  import("./components/DataManagementView").then((module) => ({
    default: module.DataManagementView,
  })),
);
const ActivityLogsView = lazy(() =>
  import("./components/ActivityLogsView").then((module) => ({
    default: module.ActivityLogsView,
  })),
);
const AutomationView = lazy(() =>
  import("./components/AutomationView").then((module) => ({
    default: module.AutomationView,
  })),
);
const PowerAnalyzerView = lazy(() =>
  import("./components/PowerAnalyzerView").then((module) => ({
    default: module.PowerAnalyzerView,
  })),
);

type Notice = { kind: "error" | "success"; text: string };
type Target = {
  mac: string;
  channels: number[];
  on: boolean;
  revisions: Record<number, number>;
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const native = isTauri();
  const automation = useAutomation(native);
  const language = useLanguage();
  useEffect(() => {
    applyLanguage(language);
    if (native)
      void getCurrentWindow()
        .setTitle(
          language === "ar"
            ? "MTTL Control | إدارة الطاقة"
            : "MTTL Control | Power Control",
        )
        .catch((error) => console.error("Window title:", error));
  }, [language, native]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [removedDevices, setRemovedDevices] = useState<RemovedDevice[]>([]);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [setupBusy, setSetupBusy] = useState(false);
  const [provisionTargets, setProvisionTargets] = useState<ProvisionTarget[]>(
    [],
  );
  const [opened, setOpened] = useState<Record<string, boolean>>({
    dashboard: true,
  });
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [selectedMac, setSelectedMac] = useState("");
  const [historyTarget, setHistoryTarget] = useState<{
    mac: string;
    channel?: number;
    token?: number;
  }>({ mac: "" });
  const [dataAction, setDataAction] = useState<ClearDataKind | undefined>();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [rawLogs, setRawLogs] = useState<RawLogEvent[]>([]);
  const [loading, setLoading] = useState(native);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const monitorTriggers = useRef<Map<number, number | null> | null>(null);
  useEffect(() => {
    if (!automation.available) return;
    const previous = monitorTriggers.current;
    if (previous) {
      const triggered = automation.data.monitors.find(
        (rule) =>
          rule.last_triggered_at !== null &&
          rule.last_triggered_at !== previous.get(rule.id),
      );
      if (triggered)
        setNotice({
          kind: "error",
          text: `${t("Monitoring alert")}: ${triggered.definition.name} · CH ${triggered.definition.target.channel} · ${t(triggered.definition.comparison === "above" ? "Above" : "Below")} ${triggered.definition.threshold} ${triggered.definition.metric === "power" ? "W" : "°C"} · ${t(triggered.definition.action === "off" ? "Alert and switch off" : "Record an alert")}`,
        });
    }
    monitorTriggers.current = new Map(
      automation.data.monitors.map((rule) => [rule.id, rule.last_triggered_at]),
    );
  }, [automation.data.monitors, automation.available, language]);
  const [pending, setPending] = useState<Record<string, string>>({});
  const locks = useRef(new Set<string>());
  const mounted = useRef(true);
  const loadVersion = useRef(0);
  const loadDevices = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const [list, status, removed] = await Promise.all([
        api.getDevices(),
        api.getServerStatus(),
        api.getRemovedDevices(),
      ]);
      if (mounted.current && version === loadVersion.current) {
        setDevices(list);
        setRemovedDevices(removed);
        setServer(status);
        setLoadError("");
        setLoading(false);
        setSelectedMac((mac) =>
          list.some((d) => d.mac === mac) ? mac : list[0]?.mac || "",
        );
      }
      return list;
    } catch (error) {
      if (mounted.current && version === loadVersion.current) {
        setLoadError(errorMessage(error));
        setLoading(false);
        setServer(null);
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!native)
      return () => {
        mounted.current = false;
      };
    const reload = () => {
      void loadDevices().catch(() => {});
    };
    const eventError = (error: unknown) =>
      setNotice({
        kind: "error",
        text: `Live updates unavailable: ${errorMessage(error)}. Status polling remains active.`,
      });
    const cleanup = [
      api.onEvent<RawLogEvent>(
        "raw-log",
        (payload) =>
          setRawLogs((previous) => [payload, ...previous].slice(0, 300)),
        eventError,
      ),
      ...[
        "telemetry-update",
        "diagnostics-update",
        "relay-change",
        "device-connected",
        "device-disconnected",
        "device-removed",
        "data-cleared",
      ].map((event) => api.onEvent(event, reload, eventError)),
    ];
    reload();
    const timer = setInterval(reload, 2000);
    return () => {
      mounted.current = false;
      cleanup.forEach((fn) => fn());
      clearInterval(timer);
    };
  }, [loadDevices, native]);

  useEffect(() => applyTheme(theme), [theme]);
  function navigate(tab: string) {
    if (setupBusy && tab !== "provision") {
      setNotice({
        kind: "error",
        text: "Device setup is running. Stop the queue and wait for the current device to finish before leaving.",
      });
      return;
    }
    setOpened((previous) =>
      previous[tab] ? previous : { ...previous, [tab]: true },
    );
    setActiveTab(tab);
  }
  function prepareSetup(targets: ProvisionTarget[]) {
    setProvisionTargets(targets);
    navigate("provision");
  }
  function showHistory(mac: string, channel?: number) {
    setHistoryTarget({ mac, channel, token: Date.now() });
    navigate("history");
  }
  function showData(kind?: ClearDataKind) {
    setDataAction(kind);
    navigate("data");
  }
  async function clearData(
    kind: ClearDataKind,
    mac?: string,
    channel?: number,
  ): Promise<boolean> {
    return run(
      "global",
      "Clearing stored data",
      async () => {
        await api.clearData(kind, mac, channel);
        if (["activity", "recorded_data", "database"].includes(kind))
          setRawLogs((current) =>
            mac ? current.filter((entry) => entry.mac !== mac) : [],
          );
      },
      undefined,
      {
        successText:
          kind === "removed_list"
            ? "Removed list cleared. MAC exclusions and saved history are retained."
            : kind === "database"
              ? "Database reset. Physical strips may reconnect with default names."
              : "Selected records deleted. Incoming telemetry will continue recording.",
      },
    );
  }
  async function reboot(mac: string): Promise<boolean> {
    let before = 0;
    return run(
      mac,
      "Rebooting strip",
      async () => {
        before = await api.rebootDevice(mac);
      },
      (list) =>
        list.some(
          (device) =>
            device.mac === mac &&
            device.connection_id !== before &&
            device.connection_id > 0 &&
            deviceFresh(device),
        ),
      {
        timeoutMs: 60000,
        timeoutText:
          "Reboot was queued but the strip did not reconnect with fresh telemetry within 60 seconds. Runtime reboot support may vary by firmware. Check its power and network connection before retrying.",
        successText:
          "Strip reconnected after reboot and fresh telemetry was received.",
      },
    );
  }

  async function run(
    key: string,
    label: string,
    operation: () => Promise<void>,
    confirmation?: (list: DeviceInfo[]) => boolean,
    options: {
      timeoutMs?: number;
      timeoutText?: string;
      successText?: string;
    } = {},
  ): Promise<boolean> {
    if (
      !native ||
      locks.current.has(key) ||
      locks.current.has("global") ||
      (key === "global" && locks.current.size > 0)
    )
      return false;
    locks.current.add(key);
    setPending((previous) => ({ ...previous, [key]: label }));
    setNotice(null);
    try {
      await operation();
      if (confirmation) {
        const deadline = Date.now() + (options.timeoutMs ?? 12000);
        let confirmed = false;
        while (mounted.current && Date.now() < deadline) {
          const list = await loadDevices();
          if (confirmation(list)) {
            confirmed = true;
            break;
          }
          await pause(400);
        }
        if (!confirmed)
          throw new Error(
            options.timeoutText ??
              "The device did not confirm the requested state within 12 seconds. The display shows its last reported state; check the connection before retrying.",
          );
      } else await loadDevices();
      if (mounted.current)
        setNotice({
          kind: "success",
          text:
            options.successText ??
            (confirmation
              ? `${label} — confirmed by the device.`
              : `${label} — saved.`),
        });
      return true;
    } catch (error) {
      if (mounted.current)
        setNotice({ kind: "error", text: `${label}: ${errorMessage(error)}` });
      return false;
    } finally {
      locks.current.delete(key);
      if (mounted.current)
        setPending((previous) => {
          const next = { ...previous };
          delete next[key];
          return next;
        });
    }
  }

  function relay(mac: string, on: boolean, channel?: number) {
    const device = devices.find((d) => d.mac === mac);
    if (!device?.online) {
      setNotice({
        kind: "error",
        text: "This strip is offline. Reconnect it before sending commands.",
      });
      return;
    }
    const target: Target = {
      mac,
      channels: channel ? [channel] : [1, 2, 3, 4],
      on,
      revisions: Object.fromEntries(
        device.outlets.map((o) => [o.channel, o.report_revision]),
      ),
    };
    void run(
      mac,
      channel
        ? `Channel ${channel}: switching ${on ? "on" : "off"}`
        : `${device.alias}: switching all outlets ${on ? "on" : "off"}`,
      () =>
        channel
          ? api.setOutletState(mac, channel, on)
          : on
            ? api.allOutletsOn(mac)
            : api.allOutletsOff(mac),
      (list) => relayTargetsConfirmed(list, [target]),
    );
  }

  function refresh(macs: string[], key: string) {
    const baselines = new Map(
      devices
        .filter((d) => macs.includes(d.mac))
        .map((d) => [
          d.mac,
          new Map(d.outlets.map((o) => [o.channel, o.telemetry_at])),
        ]),
    );
    void run(
      key,
      "Refreshing telemetry",
      async () => {
        const results = await Promise.allSettled(
          macs.map((mac) => api.refreshTelemetry(mac)),
        );
        const errors = results.flatMap((result, index) =>
          result.status === "rejected"
            ? [`${macs[index]}: ${errorMessage(result.reason)}`]
            : [],
        );
        if (errors.length) throw new Error(errors.join("; "));
      },
      (list) =>
        macs.length > 0 &&
        macs.every((mac) => {
          const device = list.find((d) => d.mac === mac);
          return (
            device?.online &&
            device.outlets.length === 4 &&
            device.outlets.every(
              (o) => o.telemetry_at > (baselines.get(mac)?.get(o.channel) || 0),
            )
          );
        }),
    );
  }

  const online = devices.filter((d) => d.online);
  const controlsAvailable =
    native && !!server?.running && !loadError && !setupBusy;
  return localize(
    <div className="app-container">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navbar
        language={language}
        onToggleLanguage={() => setLanguage(language === "ar" ? "en" : "ar")}
        activeTab={activeTab}
        setActiveTab={(tab) => (tab === "data" ? showData() : navigate(tab))}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        setupBusy={setupBusy}
        connectedCount={online.length}
        server={server}
        native={native}
        busy={Object.keys(pending).length > 0 || !controlsAvailable}
        onRefreshAll={() =>
          refresh(
            online.map((d) => d.mac),
            "global",
          )
        }
        onAllStripsOff={() => {
          const targets = online.map((d) => ({
            mac: d.mac,
            channels: [1, 2, 3, 4],
            on: false,
            revisions: Object.fromEntries(
              d.outlets.map((o) => [o.channel, o.report_revision]),
            ),
          }));
          void run(
            "global",
            "Switching all strips off",
            () => api.allStripsOff(),
            (list) => relayTargetsConfirmed(list, targets),
          );
        }}
      />
      <main className="main-content" id="main-content" tabIndex={-1}>
        {!native && (
          <div className="notice info">
            <AlertCircle size={17} />
            <div>
              <strong>Desktop connection required</strong>
              <p>
                Open the desktop application to discover and control physical
                strips. Device data is unavailable in this browser.
              </p>
            </div>
          </div>
        )}
        {loadError && (
          <div className="notice error" role="alert">
            <AlertCircle size={18} />
            <div>
              <strong>Unable to read controller status</strong>
              <p>
                {loadError} Controls are disabled until the connection recovers.
              </p>
            </div>
            <button
              className="btn btn-glass"
              onClick={() => {
                void loadDevices().catch(() => {});
              }}
            >
              Retry
            </button>
          </div>
        )}
        {notice && (
          <div
            className={`notice ${notice.kind}`}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.kind === "error" ? (
              <AlertCircle size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
            <span>{notice.text}</span>
            <button
              className="notice-close"
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {pending.global && (
          <div className="notice info" role="status">
            <Loader2 size={17} className="spin" />
            {pending.global}. Waiting for device confirmation…
          </div>
        )}
        <Suspense
          fallback={
            <div className="notice info" role="status">
              {t("Loading view…")}
            </div>
          }
        >
          {opened.dashboard && (
            <div hidden={activeTab !== "dashboard"}>
              <DashboardView
                devices={devices}
                selectedMac={selectedMac}
                onSelectMac={setSelectedMac}
                loading={loading}
                native={native}
                controlsAvailable={controlsAvailable}
                pending={pending}
                onNavigate={navigate}
                onHistory={showHistory}
                onClearRemoved={() => showData("removed_list")}
                operationError={notice?.kind === "error" ? notice.text : ""}
                removedDevices={removedDevices}
                onRemove={(mac) =>
                  run(
                    mac,
                    "Removing strip",
                    () => api.removeDevice(mac),
                    undefined,
                    {
                      successText:
                        "Strip removed. Saved names and history are retained; reconnects are ignored until you add it back.",
                    },
                  )
                }
                onRestore={(mac) =>
                  run(
                    mac,
                    "Adding strip back",
                    () => api.restoreDevice(mac),
                    undefined,
                    {
                      successText:
                        "Strip added back. Waiting for its physical connection.",
                    },
                  )
                }
                onReboot={reboot}
                onToggleOutlet={(mac, channel, on) => relay(mac, on, channel)}
                onUpdateOutletName={(mac, channel, name, icon) =>
                  run(mac, "Outlet name", () =>
                    api.updateOutletMetadata(mac, channel, name, icon),
                  )
                }
                onUpdateStripAlias={(mac, alias, notes) =>
                  run(mac, "Strip details", () =>
                    api.updateDeviceAlias(mac, alias, notes),
                  )
                }
                onAllOn={(mac) => relay(mac, true)}
                onAllOff={(mac) => relay(mac, false)}
                onRefreshTelemetry={(mac) => refresh([mac], mac)}
              />
            </div>
          )}
          {opened.scanner && (
            <div hidden={activeTab !== "scanner"}>
              <NetworkScannerView
                operationError={notice?.kind === "error" ? notice.text : ""}
                devices={devices}
                removedDevices={removedDevices}
                onSelectForProvision={prepareSetup}
                onSelectDevice={(mac) => {
                  setSelectedMac(mac);
                  navigate("dashboard");
                }}
                onRestore={(mac) =>
                  run(
                    mac,
                    "Adding strip back",
                    () => api.restoreDevice(mac),
                    undefined,
                    {
                      successText:
                        "Strip added back. Waiting for its physical connection.",
                    },
                  )
                }
                onRegister={(mac, ip, alias) =>
                  run(
                    mac,
                    "Adding strip",
                    () => api.registerDevice(mac, ip, alias),
                    undefined,
                    {
                      successText:
                        "Strip registered. It will become online after connecting to this controller.",
                    },
                  )
                }
              />
            </div>
          )}
          {opened.provision && (
            <div hidden={activeTab !== "provision"}>
              <ProvisionWizardView
                initialTargets={provisionTargets}
                commandBusy={Object.keys(pending).length > 0}
                devices={devices}
                removedDevices={removedDevices}
                onBusyChange={setSetupBusy}
                onDevicesChanged={() => {
                  void loadDevices().catch(() => {});
                }}
                onNavigate={navigate}
                onSelectDevice={(mac) => {
                  setSelectedMac(mac);
                  navigate("dashboard");
                }}
              />
            </div>
          )}
          {opened.automation && (
            <div hidden={activeTab !== "automation"}>
              <AutomationView
                devices={devices}
                controller={automation}
                controlsAvailable={controlsAvailable}
                commandBusy={Object.keys(pending).length > 0 || setupBusy}
              />
            </div>
          )}
          {opened.analyzer && (
            <div hidden={activeTab !== "analyzer"}>
              <PowerAnalyzerView
                active={activeTab === "analyzer"}
                devices={devices}
                initialMac={selectedMac}
                controller={automation}
                commandBusy={Object.keys(pending).length > 0 || setupBusy}
              />
            </div>
          )}
          {opened.history && (
            <div hidden={activeTab !== "history"}>
              <HistoryView
                active={activeTab === "history"}
                historyTarget={historyTarget}
                initialMac={historyTarget.mac || selectedMac}
                initialChannel={historyTarget.channel}
                busy={Object.keys(pending).length > 0 || setupBusy}
                operationError={notice?.kind === "error" ? notice.text : ""}
                onRenameStrip={(mac, name, notes) =>
                  run(mac, "Strip name", () =>
                    api.updateDeviceAlias(mac, name, notes),
                  )
                }
                onRenameOutlet={(mac, channel, name, icon) =>
                  run(mac, "Outlet name", () =>
                    api.updateOutletMetadata(mac, channel, name, icon),
                  )
                }
                onManageData={() => showData()}
              />
            </div>
          )}
          {opened.data && (
            <div hidden={activeTab !== "data"}>
              <DataManagementView
                initialAction={dataAction}
                busy={Object.keys(pending).length > 0 || setupBusy}
                operationError={notice?.kind === "error" ? notice.text : ""}
                onClear={clearData}
              />
            </div>
          )}
          {opened.logs && (
            <div hidden={activeTab !== "logs"}>
              <ActivityLogsView onManageData={() => showData("activity")} />
            </div>
          )}
          {opened.terminal && (
            <div hidden={activeTab !== "terminal"}>
              <RawConsoleView
                logs={rawLogs}
                devices={devices}
                selectedMac={selectedMac}
                onClearLogs={() => setRawLogs([])}
              />
            </div>
          )}
        </Suspense>
        <footer className="page-footer">
          <span>MTTL-W01 / Physical device control</span>
          <span>
            Status polling · 2 s &nbsp; / &nbsp; Device telemetry · 10 s
          </span>
        </footer>
      </main>
    </div>,
  );
}
