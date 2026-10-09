import { ManualWifiSteps } from "./ManualWifiSteps";
import { displayName, localize, t } from "../i18n";
import { useEffect, useRef, useState } from "react";
import {
  Wifi,
  RefreshCw,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Terminal,
  Send,
  Sliders,
  ArrowRight,
  Plus,
  Play,
  RotateCcw,
  Eye,
  EyeOff,
  Cable,
  Check,
  Zap,
} from "lucide-react";
import { api, errorMessage, isTauri } from "../api";
import { deviceFresh, validIpv4 } from "../status";
import {
  canonicalMac,
  runtimeCandidates,
  settingsApplied,
  stripJoinPassword,
  usesAutomaticWifi,
  sendStripSettings,
} from "../provisioning";
import type {
  DeviceInfo,
  ProvisionResult,
  ProvisionTarget,
  RemovedDevice,
  SystemWifiInfo,
  SetupProbeResult,
  SetupCommandResponse,
} from "../types";

interface Props {
  initialTargets: ProvisionTarget[];
  commandBusy: boolean;
  devices: DeviceInfo[];
  removedDevices: RemovedDevice[];
  onBusyChange: (busy: boolean) => void;
  onDevicesChanged: () => void;
  onNavigate: (tab: string) => void;
  onSelectDevice: (mac: string) => void;
}

type PairingStep = 1 | 2 | 3 | 4;

interface ActivePairing {
  target: ProvisionTarget;
  status:
    | "awaiting_join"
    | "awaiting_reconnect"
    | "in_progress"
    | "verifying"
    | "success"
    | "failed"
    | "awaiting_identity";
  manualNetwork: boolean;
  step: PairingStep;
  message: string;
  result?: ProvisionResult;
  baseline?: Record<string, number>;
  matchedMac?: string;
  matchedDevice?: DeviceInfo;
  candidates?: DeviceInfo[];
}

const usableIp = (ip: string) =>
  validIpv4(ip) &&
  !ip.startsWith("127.") &&
  ip !== "0.0.0.0" &&
  Number(ip.split(".")[0]) < 224;

export function ProvisionWizardView({
  initialTargets,
  commandBusy,
  devices,
  removedDevices,
  onBusyChange,
  onDevicesChanged,
  onSelectDevice,
}: Props) {
  const native = isTauri();
  const [automaticWifi, setAutomaticWifi] = useState(false);
  const [wifi, setWifi] = useState<SystemWifiInfo | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");

  // Destination Wi-Fi credentials & Controller Network Settings
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [controllerIp, setControllerIp] = useState("");
  const [controllerPort, setControllerPort] = useState("10086");
  const [portStrategy, setPortStrategy] = useState("standard");
  const [activeServerPorts, setActiveServerPorts] = useState<number[]>([10086]);
  const [showAdvancedNetwork, setShowAdvancedNetwork] = useState(false);

  // Manual target fields
  const [manualMode, setManualMode] = useState<"auto" | "manual">("auto");
  const [manualSsid, setManualSsid] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [manualIp, setManualIp] = useState("192.168.1.1");
  const [manualPort, setManualPort] = useState("30300");
  const [manualMac, setManualMac] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);

  // Active single-device pairing state (NO QUEUE!)
  const [pairing, setPairing] = useState<ActivePairing | null>(null);

  const runningRef = useRef(false);
  const stopRef = useRef(false);
  const [selectedCandidateMac, setSelectedCandidateMac] = useState("");

  // Diagnostics & Probe Tools (kept clean and collapsed at bottom)
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [probeEndpointIp, setProbeEndpointIp] = useState("192.168.1.1");
  const [probeEndpointPort, setProbeEndpointPort] = useState("30300");
  const [probeRunning, setProbeRunning] = useState(false);
  const [probeResult, setProbeResult] = useState<SetupProbeResult | null>(null);
  const [customCommand, setCustomCommand] = useState("up:query:ip");
  const [commandOutput, setCommandOutput] =
    useState<SetupCommandResponse | null>(null);
  const [commandRunning, setCommandRunning] = useState(false);
  const [newListenerPort, setNewListenerPort] = useState("");
  const [listenerMessage, setListenerMessage] = useState("");

  // Initial detection on mount
  useEffect(() => {
    if (!native) return;
    let active = true;

    void api
      .supportsAutomaticWifiSetup()
      .then((supported) => {
        if (active) setAutomaticWifi(supported);
      })
      .catch(() => {});

    setDetecting(true);
    void Promise.allSettled([
      api.getNetworkInfo(),
      api.getSystemWifiInfo(),
    ]).then(([network, discovery]) => {
      if (!active) return;
      if (discovery.status === "fulfilled") {
        const info = discovery.value;
        setWifi(info);
        // Never guess the destination controller address from the strip's AP.
        if (!info.active_ssid || !/^(TONLY|ONLY)_TAP_/.test(info.active_ssid)) {
          if (
            network.status === "fulfilled" &&
            usableIp(network.value.local_ip)
          ) {
            setControllerIp((current) => current || network.value.local_ip);
          }
          if (info.active_ssid) {
            setSsid((current) => current || info.active_ssid!);
            setPassword((current) => current || info.active_psk || "");
          }
        }
      } else {
        setError(errorMessage(discovery.reason));
      }
      setDetecting(false);
    });

    void api
      .getServerStatus()
      .then((s) => {
        if (active && s.ports && s.ports.length > 0)
          setActiveServerPorts(s.ports);
        else if (active && s.port) setActiveServerPorts([s.port]);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [native]);

  // If initialTargets arrives (e.g. from Network Scanner), pre-fill and prepare for single pair
  useEffect(() => {
    if (initialTargets && initialTargets.length > 0) {
      const first = initialTargets[0];
      setManualMode(first.mode);
      if (first.mode === "manual") {
        setManualIp(first.ip);
        setManualPort(String(first.port || 30300));
        if (first.mac) setManualMac(first.mac);
      } else if (first.ssid) {
        setManualSsid(first.ssid);
        if (first.password) setManualPassword(first.password);
      }
      setShowManualForm(true);
    }
  }, [initialTargets]);

  async function scanWifi() {
    if (detecting || runningRef.current) return;
    setDetecting(true);
    setError("");
    try {
      const info = await api.getSystemWifiInfo();
      setWifi(info);
      if (
        !ssid &&
        info.active_ssid &&
        !/^(TONLY|ONLY)_TAP_/.test(info.active_ssid)
      ) {
        setSsid(info.active_ssid);
        if (info.active_psk) setPassword(info.active_psk);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDetecting(false);
    }
  }

  async function beginPairing(target: ProvisionTarget) {
    if (!native || runningRef.current || commandBusy) return;
    setError("");
    const supported = await api.supportsAutomaticWifiSetup().catch(() => false);
    setAutomaticWifi(supported);
    if (usesAutomaticWifi(target, supported)) {
      await startPairing(target, true);
      return;
    }
    setPairing({
      target: {
        ...target,
        password: target.ssid
          ? stripJoinPassword(target.ssid, target.password)
          : undefined,
      },
      status: "awaiting_join",
      manualNetwork: true,
      step: 1,
      message:
        "Connect this computer to the strip's Wi-Fi. If you are already connected, continue below.",
    });
  }

  // --- START ONE-BY-ONE PAIRING ---
  async function startPairing(
    target: ProvisionTarget,
    supported = automaticWifi,
  ) {
    if (!native || runningRef.current) return;
    if (commandBusy) {
      setError("Please wait for ongoing plug commands to finish.");
      return;
    }

    const automatic = usesAutomaticWifi(target, supported);

    // Validate network
    const trimmedSsid = ssid.trim();
    const trimmedController = controllerIp.trim();
    if (!usableIp(trimmedController)) {
      setError(
        "Please enter a valid controller IPv4 address for this computer.",
      );
      return;
    }
    if (
      !trimmedSsid ||
      /[:\r\n\0]/.test(trimmedSsid + password) ||
      /^(TONLY|ONLY)_TAP_/.test(trimmedSsid)
    ) {
      setError(
        "Please enter your home Wi-Fi SSID and password to give to the strip.",
      );
      return;
    }

    if (
      !Number.isInteger(Number(controllerPort)) ||
      Number(controllerPort) < 1 ||
      Number(controllerPort) > 65535 ||
      !Number.isInteger(target.port) ||
      target.port < 1 ||
      target.port > 65535 ||
      !usableIp(target.ip)
    ) {
      setError("Enter a valid IPv4 address and ports between 1 and 65535.");
      return;
    }

    setError("");
    runningRef.current = true;
    stopRef.current = false;
    onBusyChange(true);

    // Initial pairing state
    const initialPairing: ActivePairing = {
      target,
      status: "in_progress",
      manualNetwork: !automatic,
      step: 1,
      message: automatic
        ? `Connecting to strip Wi-Fi (${target.ssid || target.name})…`
        : `Connecting to strip endpoint at ${target.ip}:${target.port}…`,
    };
    setPairing(initialPairing);

    try {
      const server = await api.getServerStatus();
      if (!server.running) {
        throw new Error(
          server.error ||
            "Controller TCP listener is not running. Please start the service.",
        );
      }
      // 1. Snapshot live devices baseline
      const live = await api.getDevices();
      const baseline = Object.fromEntries(
        live.map((device) => [device.mac, device.connection_id]),
      );

      // If strip was in removed list, restore it
      if (target.mac && canonicalMac(target.mac)) {
        const cleanMac = canonicalMac(target.mac);
        if (removedDevices.some((d) => d.mac === cleanMac)) {
          await api.restoreDevice(cleanMac);
        }
      }

      // 2. Send configuration
      setPairing((prev) =>
        prev
          ? {
              ...prev,
              baseline,
              message:
                "Applying controller address and destination Wi-Fi credentials…",
            }
          : null,
      );

      const parsedCPort = Number(controllerPort);
      const result = await sendStripSettings(api, target, supported, {
        controllerIp: trimmedController,
        controllerPort: parsedCPort,
        homeSsid: trimmedSsid,
        homePassword: password,
        portStrategy,
      });

      onDevicesChanged();

      if (!result.success) {
        setPairing((prev) =>
          prev
            ? {
                ...prev,
                status: "failed",
                result,
                message: result.message,
              }
            : null,
        );
        runningRef.current = false;
        onBusyChange(false);
        return;
      }

      if (!automatic) {
        setPairing((prev) =>
          prev
            ? {
                ...prev,
                status: "awaiting_reconnect",
                step: 3,
                result,
                baseline,
                message:
                  "Settings sent. Reconnect this computer to your destination Wi-Fi, then check the strip's connection.",
              }
            : null,
        );
        return;
      }
      await verifyConnection(target, baseline, result);
    } catch (e) {
      setPairing((prev) =>
        prev
          ? {
              ...prev,
              status: "failed",
              message: errorMessage(e),
            }
          : null,
      );
    } finally {
      runningRef.current = false;
      if (stopRef.current) setPairing(null);
      onBusyChange(false);
      onDevicesChanged();
    }
  }

  async function verifyConnection(
    target: ProvisionTarget,
    baseline: Record<string, number>,
    result: ProvisionResult,
  ) {
    // Verify a new controller session with fresh telemetry.
    setPairing((prev) =>
      prev
        ? {
            ...prev,
            step: 4,
            status: "verifying",
            result,
            baseline,
            message:
              "Strip is rebooting and joining Wi-Fi. Waiting for incoming controller link…",
          }
        : null,
    );

    // 4. Verification loop (up to 60s)
    const deadline = Date.now() + 60000;
    let verified = false;

    while (Date.now() < deadline && !stopRef.current) {
      try {
        const liveDevices = await api.getDevices();
        const candidates = runtimeCandidates(target, liveDevices, baseline, []);

        if (candidates.length > 0) {
          // Check if expected MAC matches
          if (canonicalMac(target.mac)) {
            const matched =
              candidates.find((d) => d.mac === canonicalMac(target.mac)) ||
              candidates[0];
            setPairing((prev) =>
              prev
                ? {
                    ...prev,
                    status: "success",
                    matchedMac: matched.mac,
                    matchedDevice: matched,
                    message: "Device paired successfully and online!",
                  }
                : null,
            );
            onDevicesChanged();
            verified = true;
            break;
          } else if (candidates.length === 1) {
            // Unambiguous single newly connected strip! Automatically pair!
            const matched = candidates[0];
            setPairing((prev) =>
              prev
                ? {
                    ...prev,
                    status: "success",
                    matchedMac: matched.mac,
                    matchedDevice: matched,
                    message: "Device paired successfully and online!",
                  }
                : null,
            );
            onDevicesChanged();
            verified = true;
            break;
          } else {
            // Multiple candidates connected: let user quickly identify
            setPairing((prev) =>
              prev
                ? {
                    ...prev,
                    status: "awaiting_identity",
                    candidates,
                    message:
                      "Multiple new strips detected. Please select this physical strip.",
                  }
                : null,
            );
            setSelectedCandidateMac(candidates[0].mac);
            onDevicesChanged();
            verified = true;
            break;
          }
        }
      } catch {
        // ignore transient poll error
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    if (!verified && !stopRef.current) {
      setPairing((prev) =>
        prev && prev.status === "verifying"
          ? {
              ...prev,
              status: "failed",
              message:
                "No verified connection yet. Keep this computer on the destination Wi-Fi. Check the controller address and allow MTTL Control through Windows Firewall on your private network, then check again.",
            }
          : prev,
      );
    }
  }

  async function resumeVerification() {
    if (
      !pairing?.result ||
      !pairing.baseline ||
      runningRef.current ||
      commandBusy
    )
      return;
    runningRef.current = true;
    stopRef.current = false;
    onBusyChange(true);
    setError("");
    try {
      await verifyConnection(pairing.target, pairing.baseline, pairing.result);
    } finally {
      runningRef.current = false;
      if (stopRef.current) setPairing(null);
      onBusyChange(false);
      onDevicesChanged();
    }
  }

  // Confirm identity if multiple candidates appeared
  async function handleConfirmIdentity() {
    if (!pairing || !selectedCandidateMac || runningRef.current) return;
    try {
      const live = await api.getDevices();
      const matched = runtimeCandidates(
        pairing.target,
        live,
        pairing.baseline || {},
        [],
      ).find((d) => d.mac === selectedCandidateMac);
      if (!matched) {
        throw new Error(
          "Selected device is no longer reporting. Please recheck connection.",
        );
      }
      setPairing({
        ...pairing,
        status: "success",
        matchedMac: matched.mac,
        matchedDevice: matched,
        message: "Device identity confirmed and paired!",
      });
      onDevicesChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // Cancel pairing during execution
  function handleCancelPairing() {
    stopRef.current = true;
    if (runningRef.current) {
      setPairing((prev) =>
        prev
          ? {
              ...prev,
              message:
                "Stopping setup. Wait for the current operation to finish.",
            }
          : null,
      );
    } else {
      setPairing(null);
    }
  }

  // Reset pairing state to pair another strip
  function handlePairAnother() {
    setPairing(null);
    void scanWifi();
  }

  // Diagnostic tool handlers
  async function handleRunProbe() {
    if (probeRunning) return;
    setProbeRunning(true);
    setProbeResult(null);
    try {
      const portNum = parseInt(probeEndpointPort, 10) || 30300;
      const cPortNum = parseInt(controllerPort, 10) || 10086;
      const res = await api.probeSetupEndpoint(
        probeEndpointIp.trim() || "192.168.1.1",
        portNum,
        controllerIp.trim() || undefined,
        cPortNum,
      );
      setProbeResult(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProbeRunning(false);
    }
  }

  async function handleSendCommand() {
    if (commandRunning || !customCommand.trim()) return;
    setCommandRunning(true);
    try {
      const portNum = parseInt(probeEndpointPort, 10) || 30300;
      const res = await api.sendSetupCommand(
        probeEndpointIp.trim() || "192.168.1.1",
        portNum,
        customCommand.trim(),
        3000,
      );
      setCommandOutput(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCommandRunning(false);
    }
  }

  async function handleAddListener() {
    const p = parseInt(newListenerPort, 10);
    if (!p || p <= 0 || p > 65535) {
      setListenerMessage("Enter a valid port between 1 and 65535");
      return;
    }
    try {
      const res = await api.addServerListener(p);
      if (res.ports) setActiveServerPorts(res.ports);
      setListenerMessage(`Listening on port ${p}`);
      setNewListenerPort("");
    } catch (e) {
      setListenerMessage(errorMessage(e));
    }
  }

  const detectedStrips = wifi?.detected_strip_aps || [];
  const isBusy = runningRef.current || commandBusy;
  const settingsLocked =
    isBusy || !!(pairing?.result && settingsApplied(pairing.result));

  return localize(
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DEVICE SETUP</span>
          <h2>Device setup</h2>
          <p>Set up strips with your Wi-Fi network and this controller.</p>
          <p>{devices.filter(deviceFresh).length} connected</p>
        </div>
        <Wifi size={24} className="muted" />
      </div>

      {error && (
        <div className="notice error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {!native && (
        <div className="notice">
          Device discovery and setup require the desktop application.
        </div>
      )}

      {!automaticWifi && native && (
        <div className="notice info">
          <Wifi size={18} />
          <span>
            Keep your destination Wi-Fi details below. Choose a strip, join its
            Wi-Fi with the displayed password, send settings, then reconnect to
            your destination Wi-Fi and check the connection.
          </span>
        </div>
      )}

      {/* 1. NETWORK CREDENTIALS CARD (Clean & Compact) */}
      <section className="panel view-panel" style={{ marginBottom: "22px" }}>
        <div className="section-heading" style={{ marginBottom: "16px" }}>
          <div>
            <h3>1. Target network & controller</h3>
            <span>
              Credentials that will be sent to the power strip so it connects to
              your system.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-subtle"
            style={{
              fontSize: "0.825rem",
              padding: "4px 10px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={() => setShowAdvancedNetwork(!showAdvancedNetwork)}
          >
            <Sliders size={14} />
            {showAdvancedNetwork ? "Hide advanced" : "Advanced options"}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          <label className="field-label">
            Destination Wi-Fi SSID
            <input
              dir="auto"
              className="input-field"
              value={ssid}
              disabled={settingsLocked}
              placeholder="e.g. MyHome_WiFi"
              onChange={(e) => setSsid(e.target.value)}
              autoComplete="off"
            />
          </label>

          <label className="field-label" style={{ position: "relative" }}>
            Destination Wi-Fi password
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <input
                dir="auto"
                className="input-field"
                type={showPassword ? "text" : "password"}
                value={password}
                disabled={settingsLocked}
                placeholder="Wi-Fi password"
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                style={{ width: "100%", paddingInline: "36px" }}
              />
              <button
                type="button"
                className="btn-ghost icon-button"
                style={{
                  position: "absolute",
                  insetInlineEnd: "4px",
                  padding: "6px",
                  color: "var(--text-muted)",
                }}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={
                  showPassword ? "Hide Wi-Fi password" : "Show Wi-Fi password"
                }
                disabled={settingsLocked}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label className="field-label">
            Controller IPv4 on destination network
            <input
              dir="ltr"
              className="input-field"
              value={controllerIp}
              disabled={settingsLocked}
              placeholder="192.168.1.10"
              onChange={(e) => setControllerIp(e.target.value)}
            />
            <span
              style={{
                fontSize: "0.775rem",
                color: "var(--success-text)",
                marginTop: "3px",
                display: "inline-block",
              }}
            >
              Keep this computer's destination-network address when joining the
              strip's Wi-Fi.
            </span>
          </label>
        </div>

        {showAdvancedNetwork && (
          <div
            style={{
              marginTop: "16px",
              paddingTop: "16px",
              borderTop: "1px solid var(--border-subtle)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "14px",
            }}
          >
            <label className="field-label">
              Controller port
              <input
                dir="ltr"
                className="input-field"
                value={controllerPort}
                disabled={settingsLocked}
                onChange={(e) => setControllerPort(e.target.value)}
                placeholder="10086"
              />
            </label>

            <label className="field-label">
              Port command strategy
              <select
                className="input-field"
                value={portStrategy}
                disabled={settingsLocked}
                onChange={(e) => setPortStrategy(e.target.value)}
              >
                <option value="standard">
                  Standard (up:ip:&lt;ip&gt;) - Default :10086
                </option>
                <option value="combined">
                  Combined colon (up:ip:&lt;ip&gt;:&lt;port&gt;)
                </option>
                <option value="combined_comma">
                  Combined comma (up:ip:&lt;ip&gt;,&lt;port&gt;)
                </option>
                <option value="separate_port">
                  Separate port (up:ip then up:port)
                </option>
              </select>
            </label>

            <label className="field-label">
              Strip default setup endpoint
              <input
                dir="ltr"
                className="input-field"
                value="192.168.1.1:30300"
                disabled
              />
            </label>
          </div>
        )}
      </section>

      {pairing ? (
        /* ACTIVE PAIRING CARD (In Progress / Success / Failed) */
        <section
          className="panel view-panel"
          style={{
            borderColor:
              pairing.status === "success"
                ? "rgba(34, 197, 94, 0.4)"
                : pairing.status === "failed"
                  ? "rgba(239, 68, 68, 0.4)"
                  : "var(--accent-main)",
            background:
              pairing.status === "success"
                ? "rgba(34, 197, 94, 0.04)"
                : pairing.status === "failed"
                  ? "rgba(239, 68, 68, 0.04)"
                  : "var(--surface-subtle)",
            marginBottom: "24px",
            padding: "24px",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {pairing.status === "success" ? (
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "50%",
                    background: "rgba(34, 197, 94, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--success-text)",
                  }}
                >
                  <CheckCircle2 size={24} />
                </div>
              ) : pairing.status === "failed" ? (
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "50%",
                    background: "rgba(239, 68, 68, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--danger-text)",
                  }}
                >
                  <AlertCircle size={24} />
                </div>
              ) : (
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "50%",
                    background: "rgba(56, 189, 248, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent-cyan)",
                  }}
                >
                  {pairing.status === "awaiting_join" ||
                  pairing.status === "awaiting_reconnect" ? (
                    <Wifi size={24} />
                  ) : (
                    <Loader2 size={24} className="spin" />
                  )}
                </div>
              )}
              <div>
                <h3 style={{ margin: 0, fontSize: "1.25rem" }}>
                  {pairing.status === "success"
                    ? "Pairing complete!"
                    : pairing.status === "failed"
                      ? "Pairing needs attention"
                      : pairing.status === "awaiting_join"
                        ? "Join strip Wi-Fi"
                        : pairing.status === "awaiting_reconnect"
                          ? "Return to destination Wi-Fi"
                          : pairing.status === "awaiting_identity"
                            ? "Confirm device identity"
                            : `Pairing ${pairing.target.name || "Power Strip"}…`}
                </h3>
                <span
                  style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}
                >
                  {pairing.target.ssid ? (
                    <>
                      <span>{t("Wi-Fi AP:")} </span>
                      <bdi dir="ltr">{pairing.target.ssid}</bdi>
                    </>
                  ) : (
                    <>
                      <span>{t("Endpoint:")} </span>
                      <bdi dir="ltr">
                        {pairing.target.ip}:{pairing.target.port}
                      </bdi>
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Quick Status Tag */}
            <span
              style={{
                padding: "4px 12px",
                borderRadius: "20px",
                fontSize: "0.85rem",
                fontWeight: 600,
                background:
                  pairing.status === "success"
                    ? "rgba(34, 197, 94, 0.2)"
                    : pairing.status === "failed"
                      ? "rgba(239, 68, 68, 0.2)"
                      : "rgba(56, 189, 248, 0.2)",
                color:
                  pairing.status === "success"
                    ? "var(--success-text)"
                    : pairing.status === "failed"
                      ? "var(--danger-text)"
                      : "var(--accent-cyan)",
              }}
            >
              {pairing.status === "success"
                ? "Paired & Verified"
                : pairing.status === "failed"
                  ? "Failed"
                  : pairing.status === "awaiting_join" ||
                      pairing.status === "awaiting_reconnect"
                    ? "Your next step"
                    : pairing.status === "verifying"
                      ? "Verifying Link"
                      : "Configuring"}
            </span>
          </div>

          {/* STEP INDICATOR PILLS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "8px",
              margin: "20px 0 16px 0",
            }}
          >
            {[
              { num: 1, label: "1. Connect Strip" },
              { num: 2, label: "2. Send Config" },
              {
                num: 3,
                label: pairing.manualNetwork
                  ? "3. Return to destination Wi-Fi"
                  : "3. Restore Wi-Fi",
              },
              { num: 4, label: "4. Verify Link" },
            ].map((s) => {
              const isPast =
                pairing.step > s.num || pairing.status === "success";
              const isCurrent =
                pairing.step === s.num &&
                pairing.status !== "success" &&
                pairing.status !== "failed";
              return (
                <div
                  key={s.num}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    fontWeight: isCurrent ? 600 : 400,
                    textAlign: "center",
                    background: isPast
                      ? "rgba(34, 197, 94, 0.15)"
                      : isCurrent
                        ? "rgba(56, 189, 248, 0.15)"
                        : "rgba(255, 255, 255, 0.04)",
                    color: isPast
                      ? "var(--success-text)"
                      : isCurrent
                        ? "var(--accent-cyan)"
                        : "var(--text-muted)",
                    border: `1px solid ${
                      isPast
                        ? "rgba(34, 197, 94, 0.3)"
                        : isCurrent
                          ? "rgba(56, 189, 248, 0.4)"
                          : "transparent"
                    }`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {isPast ? (
                    <Check size={14} />
                  ) : isCurrent ? (
                    pairing.status === "awaiting_join" ||
                    pairing.status === "awaiting_reconnect" ? (
                      <Wifi size={13} />
                    ) : (
                      <Loader2 size={13} className="spin" />
                    )
                  ) : null}
                  {s.label}
                </div>
              );
            })}
          </div>

          {/* Current Message */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "6px",
              background: "rgba(0, 0, 0, 0.15)",
              fontSize: "0.925rem",
              margin: "12px 0 20px 0",
              color:
                pairing.status === "failed"
                  ? "var(--danger-text)"
                  : "var(--text-main)",
            }}
          >
            {pairing.message}
            {pairing.status === "failed" &&
              !pairing.result?.settings_applied &&
              pairing.manualNetwork && (
                <p>
                  Keep this computer connected to the strip's setup Wi-Fi, check
                  the strip is in setup mode, then retry. A Wi-Fi connection
                  alone does not send the strip's settings.
                </p>
              )}
          </div>

          {pairing.manualNetwork &&
            (pairing.status === "awaiting_join" ||
              pairing.status === "awaiting_reconnect") && (
              <ManualWifiSteps
                stage={
                  pairing.status === "awaiting_join" ? "join" : "reconnect"
                }
                target={pairing.target}
                homeSsid={ssid}
                busy={isBusy}
                onContinue={() =>
                  void (pairing.status === "awaiting_join"
                    ? startPairing(pairing.target, false)
                    : resumeVerification())
                }
                onCancel={handlePairAnother}
              />
            )}

          {/* Awaiting Identity confirmation if ambiguous */}
          {pairing.status === "awaiting_identity" && pairing.candidates && (
            <div
              style={{
                margin: "16px 0",
                padding: "16px",
                background: "rgba(234, 179, 8, 0.1)",
                borderRadius: "8px",
                border: "1px solid rgba(234, 179, 8, 0.3)",
              }}
            >
              <h4 style={{ margin: "0 0 8px 0" }}>
                Select the physical strip:
              </h4>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  marginBottom: "12px",
                }}
              >
                Multiple new devices connected to the controller. Choose which
                one matches this strip:
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <select
                  className="input-field"
                  style={{ flex: 1, minWidth: "220px" }}
                  value={selectedCandidateMac}
                  onChange={(e) => setSelectedCandidateMac(e.target.value)}
                >
                  {pairing.candidates.map((c) => (
                    <option key={c.mac} value={c.mac}>
                      {displayName(c.alias)} · {c.mac} · {c.ip}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleConfirmIdentity()}
                >
                  Confirm & Finish Pairing
                </button>
              </div>
            </div>
          )}

          {/* ACTIONS: Success vs Failed vs In Progress */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {pairing.status === "success" && (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  onClick={() => {
                    if (pairing.matchedMac) {
                      onSelectDevice(pairing.matchedMac);
                    }
                  }}
                >
                  <Zap size={16} />
                  Open strip in dashboard
                </button>
                <button
                  type="button"
                  className="btn btn-glass"
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  onClick={handlePairAnother}
                >
                  <Plus size={16} />
                  Pair another device
                </button>
              </>
            )}

            {pairing.status === "failed" && (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    void (pairing.result && settingsApplied(pairing.result)
                      ? resumeVerification()
                      : beginPairing(pairing.target))
                  }
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <RotateCcw size={16} />
                  {pairing.result && settingsApplied(pairing.result)
                    ? "Check connection again"
                    : "Retry pairing"}
                </button>
                <button
                  type="button"
                  className="btn btn-glass"
                  onClick={handlePairAnother}
                >
                  Back to available devices
                </button>
              </>
            )}

            {(pairing.status === "in_progress" ||
              pairing.status === "verifying") && (
              <button
                type="button"
                className="btn btn-subtle"
                onClick={handleCancelPairing}
              >
                Cancel pairing
              </button>
            )}
          </div>
        </section>
      ) : (
        /* DISCOVERY / LIST OF STRIPS (Select one to pair directly) */
        <section className="panel view-panel" style={{ marginBottom: "24px" }}>
          <div className="section-heading" style={{ marginBottom: "16px" }}>
            <div>
              <h3>2. Select strip to pair</h3>
              <span>
                {detecting
                  ? "Scanning for nearby setup access points…"
                  : `${detectedStrips.length} strip(s) detected in setup mode · Current Wi-Fi: ${wifi?.active_ssid || "None"}`}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-glass"
              disabled={isBusy || detecting}
              onClick={() => void scanWifi()}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <RefreshCw size={15} className={detecting ? "spin" : ""} />
              {detecting ? "Scanning…" : "Scan Wi-Fi"}
            </button>
          </div>

          {/* LIST OF DETECTED STRIPS */}
          {detectedStrips.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "14px",
                marginBottom: "20px",
              }}
            >
              {detectedStrips.map((ap) => (
                <div
                  key={ap.ssid + ap.bssid}
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    background: "var(--surface-subtle)",
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        background: "rgba(56, 189, 248, 0.1)",
                        color: "var(--accent-cyan)",
                        flexShrink: 0,
                      }}
                    >
                      <Cable size={22} />
                    </div>
                    <div>
                      <strong style={{ fontSize: "1.05rem", display: "block" }}>
                        <bdi dir="ltr">{ap.ssid}</bdi>
                      </strong>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-muted)",
                          display: "block",
                        }}
                      >
                        BSSID: {ap.bssid || "Standard"}
                      </span>
                      <label
                        className="field-label"
                        style={{ marginTop: "10px" }}
                      >
                        Password to join the strip
                        <input
                          className="input-field"
                          dir="ltr"
                          readOnly
                          value={
                            ap.derived_password || stripJoinPassword(ap.ssid)
                          }
                        />
                      </label>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--success-text)",
                          marginTop: "2px",
                          display: "inline-block",
                        }}
                      >
                        {automaticWifi
                          ? "● Ready for one-click setup"
                          : "Ready for guided setup"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isBusy}
                    onClick={() =>
                      void beginPairing({
                        id: crypto.randomUUID(),
                        mode: "auto",
                        name: ap.ssid,
                        ssid: ap.ssid,
                        bssid: ap.bssid,
                        password: ap.derived_password,
                        ip: "192.168.1.1",
                        port: 30300,
                      })
                    }
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <span>Pair this strip</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                background: "rgba(255, 255, 255, 0.02)",
                borderRadius: "8px",
                border: "1px dashed var(--border-subtle)",
                marginBottom: "20px",
              }}
            >
              <Wifi
                size={32}
                className="muted"
                style={{ margin: "0 auto 10px auto", opacity: 0.5 }}
              />
              <p style={{ margin: "0 0 6px 0", fontWeight: 500 }}>
                {detecting
                  ? "Searching for smart strips…"
                  : "No strips detected in setup mode"}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: "var(--text-muted)",
                }}
              >
                Hold the power button on the physical strip for 5 seconds until
                the LED blinks (TONLY_TAP_…), then click Scan Wi-Fi.
              </p>
            </div>
          )}

          <button
            type="button"
            className="btn btn-glass"
            disabled={isBusy}
            onClick={() => {
              setManualMode("manual");
              setShowManualForm(true);
              if (
                wifi?.active_ssid &&
                /^(TONLY|ONLY)_TAP_/.test(wifi.active_ssid)
              )
                setManualSsid(wifi.active_ssid);
            }}
          >
            Already connected? Continue without scanning
          </button>

          {/* COLLAPSIBLE MANUAL / DIRECT IP SETUP */}
          <div
            style={{
              marginTop: "10px",
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: "14px",
            }}
          >
            <button
              type="button"
              className="btn btn-subtle"
              style={{ fontSize: "0.85rem", padding: "4px 8px" }}
              onClick={() => setShowManualForm(!showManualForm)}
            >
              {showManualForm
                ? "▲ Hide manual IP setup"
                : "▼ Can't find strip? Enter IP or custom SSID manually"}
            </button>

            {showManualForm && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "16px",
                  borderRadius: "8px",
                  background: "var(--surface-subtle)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{ display: "flex", gap: "16px", marginBottom: "14px" }}
                >
                  <label
                    className="radio-label"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="manualMode"
                      checked={manualMode === "auto"}
                      onChange={() => setManualMode("auto")}
                    />
                    <span>Setup AP Wi-Fi (TONLY_TAP_…)</span>
                  </label>
                  <label
                    className="radio-label"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="manualMode"
                      checked={manualMode === "manual"}
                      onChange={() => setManualMode("manual")}
                    />
                    <span>Reachable endpoint (IP & Port)</span>
                  </label>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "12px",
                  }}
                >
                  {manualMode === "auto" ? (
                    <>
                      <label className="field-label">
                        Setup SSID
                        <input
                          dir="ltr"
                          className="input-field"
                          placeholder="TONLY_TAP_XXXX"
                          value={manualSsid}
                          onChange={(e) => setManualSsid(e.target.value)}
                        />
                      </label>
                      <label className="field-label">
                        Setup password (optional)
                        <input
                          dir="auto"
                          className="input-field"
                          type="password"
                          placeholder="Blank uses derived LGU_"
                          value={manualPassword}
                          onChange={(e) => setManualPassword(e.target.value)}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="field-label">
                        Strip setup Wi-Fi name (optional)
                        <input
                          className="input-field"
                          dir="auto"
                          placeholder="TONLY_TAP_..."
                          value={manualSsid}
                          onChange={(e) => setManualSsid(e.target.value)}
                        />
                      </label>
                      <label className="field-label">
                        Strip setup IPv4
                        <input
                          dir="ltr"
                          className="input-field"
                          value={manualIp}
                          onChange={(e) => setManualIp(e.target.value)}
                        />
                      </label>
                      <label className="field-label">
                        Setup port
                        <input
                          dir="ltr"
                          className="input-field"
                          value={manualPort}
                          onChange={(e) => setManualPort(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {manualSsid.trim() && (
                    <label className="field-label">
                      Password to join the strip
                      <input
                        className="input-field"
                        dir="ltr"
                        readOnly
                        value={stripJoinPassword(manualSsid, manualPassword)}
                      />
                    </label>
                  )}
                  <label className="field-label">
                    Expected runtime MAC (optional)
                    <input
                      dir="ltr"
                      className="input-field"
                      placeholder="12 hex digits"
                      value={manualMac}
                      onChange={(e) => setManualMac(e.target.value)}
                    />
                  </label>
                </div>

                <div style={{ marginTop: "14px" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isBusy}
                    onClick={() => {
                      if (manualMode === "auto" && !manualSsid.trim()) {
                        setError(
                          "Please enter the strip's setup SSID (e.g. TONLY_TAP_...).",
                        );
                        return;
                      }
                      if (
                        manualMode === "manual" &&
                        !usableIp(manualIp.trim())
                      ) {
                        setError(
                          "Please enter a valid IPv4 address for the strip endpoint.",
                        );
                        return;
                      }
                      void beginPairing({
                        id: crypto.randomUUID(),
                        mode: manualMode,
                        name:
                          manualMode === "auto"
                            ? manualSsid.trim()
                            : manualIp.trim(),
                        ssid: manualSsid.trim() || undefined,
                        password: manualPassword || undefined,
                        ip: manualIp.trim() || "192.168.1.1",
                        port: Number(manualPort) || 30300,
                        mac: canonicalMac(manualMac) || undefined,
                      });
                    }}
                  >
                    Continue with this strip
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 3. COLLAPSIBLE ADVANCED DIAGNOSTICS & SOCKET TERMINAL */}
      <section className="panel view-panel" style={{ marginTop: "24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h4 style={{ margin: "0 0 4px 0", fontSize: "0.95rem" }}>
              Advanced diagnostics & socket tools
            </h4>
            <span style={{ fontSize: "0.825rem", color: "var(--text-muted)" }}>
              Firmware capability tests, direct port terminal, and multi-port
              server listener management.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-subtle"
            style={{
              fontSize: "0.8rem",
              padding: "4px 10px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={() => setShowDiagnostics(!showDiagnostics)}
          >
            <Terminal size={14} />
            {showDiagnostics ? "Hide tools" : "Show tools"}
          </button>
        </div>

        {showDiagnostics && (
          <div style={{ marginTop: "18px", display: "grid", gap: "16px" }}>
            {/* Server Multi-Port Listeners */}
            <div
              style={{
                padding: "14px",
                background: "rgba(0,0,0,0.15)",
                borderRadius: "6px",
              }}
            >
              <strong>Controller Server Listeners</strong>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginTop: "8px",
                }}
              >
                <span style={{ fontSize: "0.85rem" }}>Active Ports:</span>
                {activeServerPorts.map((p) => (
                  <span
                    key={p}
                    style={{
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: "rgba(34, 197, 94, 0.15)",
                      border: "1px solid rgba(34, 197, 94, 0.3)",
                      color: "var(--success-text)",
                      fontSize: "0.85rem",
                    }}
                  >
                    TCP :{p}
                  </span>
                ))}
                <input
                  dir="ltr"
                  className="input-field"
                  placeholder="Port (e.g. 10087)"
                  value={newListenerPort}
                  onChange={(e) => setNewListenerPort(e.target.value)}
                  style={{
                    width: "110px",
                    padding: "4px 8px",
                    fontSize: "0.85rem",
                  }}
                />
                <button
                  type="button"
                  className="btn btn-subtle"
                  onClick={() => void handleAddListener()}
                  style={{ fontSize: "0.85rem", padding: "4px 10px" }}
                >
                  Add Listener
                </button>
                {listenerMessage && (
                  <span
                    style={{ fontSize: "0.825rem", color: "var(--text-muted)" }}
                  >
                    {listenerMessage}
                  </span>
                )}
              </div>
            </div>

            {/* Socket Command Console */}
            <div
              style={{
                padding: "14px",
                background: "rgba(0,0,0,0.15)",
                borderRadius: "6px",
                display: "grid",
                gap: "10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <strong>Send Raw Setup Command to Strip</strong>
                <div
                  style={{ display: "flex", gap: "6px", alignItems: "center" }}
                >
                  <span style={{ fontSize: "0.85rem" }}>Target:</span>
                  <input
                    dir="ltr"
                    className="input-field"
                    value={probeEndpointIp}
                    onChange={(e) => setProbeEndpointIp(e.target.value)}
                    style={{
                      width: "110px",
                      padding: "4px 8px",
                      fontSize: "0.85rem",
                    }}
                  />
                  <span>:</span>
                  <input
                    dir="ltr"
                    className="input-field"
                    value={probeEndpointPort}
                    onChange={(e) => setProbeEndpointPort(e.target.value)}
                    style={{
                      width: "65px",
                      padding: "4px 8px",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[
                  "up:query:ip",
                  "up:query:port",
                  `up:ip:${controllerIp || "192.168.1.155"}:${controllerPort}`,
                  "up:reboot:0",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="btn btn-subtle"
                    onClick={() => setCustomCommand(preset)}
                    style={{
                      fontSize: "0.75rem",
                      padding: "2px 8px",
                      fontFamily: "monospace",
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  dir="ltr"
                  className="input-field"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  style={{ flex: 1, fontFamily: "monospace" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSendCommand();
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={commandRunning || !customCommand.trim()}
                  onClick={() => void handleSendCommand()}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  {commandRunning ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Send
                </button>
              </div>

              {commandOutput && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    background: "rgba(15, 23, 42, 0.7)",
                    fontSize: "0.85rem",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--text-muted)",
                      fontSize: "0.775rem",
                    }}
                  >
                    <span>TX: {commandOutput.command}</span>
                    <span>
                      {commandOutput.latency_ms} ms · {commandOutput.byte_count}{" "}
                      B
                    </span>
                  </div>
                  <div>
                    Response:{" "}
                    <span
                      style={{
                        color: "var(--accent-cyan)",
                        fontFamily: "monospace",
                      }}
                    >
                      {commandOutput.raw_response || "<empty>"}
                    </span>
                  </div>
                  {commandOutput.raw_hex && (
                    <div
                      style={{
                        color: "#8d9cb0",
                        fontSize: "0.775rem",
                        fontFamily: "monospace",
                      }}
                    >
                      HEX: {commandOutput.raw_hex}
                    </div>
                  )}
                  {commandOutput.error && (
                    <div style={{ color: "var(--danger-text)" }}>
                      Error: {commandOutput.error}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Automated Capability Probe */}
            <div
              style={{
                padding: "14px",
                background: "rgba(0,0,0,0.15)",
                borderRadius: "6px",
                display: "grid",
                gap: "10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <strong>Automated Port Capability Probe</strong>
                <button
                  type="button"
                  className="btn btn-subtle"
                  disabled={probeRunning}
                  onClick={() => void handleRunProbe()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.85rem",
                  }}
                >
                  {probeRunning ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <Play size={14} />
                  )}
                  Run probe
                </button>
              </div>

              {probeResult && (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: probeResult.reachable
                      ? "var(--success-text)"
                      : "var(--danger-text)",
                  }}
                >
                  {probeResult.summary}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </>,
  );
}
