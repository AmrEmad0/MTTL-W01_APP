import { t, displayName, localize } from "../i18n";
import { useEffect, useState } from "react";
import {
  Radio,
  Search,
  Wifi,
  Copy,
  Check,
  AlertCircle,
  Server,
  Plus,
  ArrowRight,
} from "lucide-react";
import { api, errorMessage, isTauri } from "../api";
import { validIpv4, validSubnet } from "../status";
import { canonicalMac, matchHostDevice } from "../provisioning";
import { ConfirmDialog } from "./ConfirmDialog";
import type {
  DeviceInfo,
  RemovedDevice,
  NetworkHost,
  NetworkInfo,
  ProvisionTarget,
} from "../types";
interface Props {
  devices: DeviceInfo[];
  operationError: string;
  removedDevices: RemovedDevice[];
  onSelectForProvision: (targets: ProvisionTarget[]) => void;
  onSelectDevice: (mac: string) => void;
  onRestore: (mac: string) => Promise<boolean>;
  onRegister: (mac: string, ip: string, alias: string) => Promise<boolean>;
}
export function NetworkScannerView({
  devices,
  operationError,
  removedDevices,
  onSelectForProvision,
  onSelectDevice,
  onRestore,
  onRegister,
}: Props) {
  const native = isTauri();
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [subnet, setSubnet] = useState("");
  const [hosts, setHosts] = useState<NetworkHost[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [onlyStrips, setOnlyStrips] = useState(false);
  const [adding, setAdding] = useState<{
    mac: string;
    ip: string;
    alias: string;
  } | null>(null);
  const [addingBusy, setAddingBusy] = useState(false);
  const [addError, setAddError] = useState("");
  useEffect(() => {
    if (!native) return;
    let active = true;
    void api
      .getNetworkInfo()
      .then((info) => {
        if (active) {
          setNetwork(info);
          setSubnet(info.subnet);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [native]);
  async function scan() {
    if (scanning || !native) return;
    if (!validSubnet(subnet)) {
      setError(
        "Enter an IPv4 network, for example 192.168.1.0/24. Discovery supports /24 networks.",
      );
      return;
    }
    setScanning(true);
    setError("");
    setHosts([]);
    setSelected([]);
    setScanned(false);
    try {
      setHosts(await api.scanNetwork(subnet.trim()));
      setScanned(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setScanning(false);
    }
  }
  async function copy(ip: string) {
    try {
      await navigator.clipboard.writeText(ip);
      setCopied(ip);
    } catch (e) {
      setError(`Unable to copy address: ${errorMessage(e)}`);
    }
  }
  function target(host: NetworkHost): ProvisionTarget {
    return {
      id: `tcp:${host.ip}:30300`,
      mode: "manual",
      name: matchHostDevice(host, devices)?.alias || host.ip,
      mac: canonicalMac(host.mac) || undefined,
      ip: host.ip,
      port: 30300,
    };
  }
  async function add() {
    if (!adding) return;
    setAddError("");
    if (
      !canonicalMac(adding.mac) ||
      !validIpv4(adding.ip) ||
      !adding.alias.trim()
    ) {
      setAddError(
        "Enter the physical strip’s MAC address, IPv4 address, and name.",
      );
      return;
    }
    setAddingBusy(true);
    try {
      const success = await onRegister(
        canonicalMac(adding.mac),
        adding.ip.trim(),
        adding.alias.trim(),
      );
      if (success) setAdding(null);
      else
        setAddError(
          "The strip could not be added. Check the controller notification for details.",
        );
    } finally {
      setAddingBusy(false);
    }
  }
  function openAdd(host?: NetworkHost) {
    setAddError("");
    setAdding({
      mac: canonicalMac(host?.mac),
      ip: host?.ip || "",
      alias: host?.mac ? `Strip ${canonicalMac(host.mac).slice(-4)}` : "",
    });
  }
  const visible = onlyStrips ? hosts.filter((host) => host.is_mttl) : hosts;
  const selectedHosts = hosts.filter(
    (host) =>
      selected.includes(host.ip) &&
      host.setup_port_open &&
      !matchHostDevice(host, devices)?.online,
  );
  return localize(
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DEVICE DISCOVERY</div>
          <h2>Network discovery</h2>
          <p>
            Find strips, add existing equipment, or queue several devices for
            setup.
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={!native}
          onClick={() => openAdd()}
        >
          <Plus size={18} />
          Add by MAC / IP
        </button>
      </div>
      <section className="panel view-panel">
        <div className="section-heading">
          <div>
            <h3>Local network</h3>
            <span>
              {network
                ? `Controller ${network.local_ip} · Gateway ${network.default_gateway || "unavailable"}`
                : native
                  ? "Detecting local network information."
                  : "Local network access requires the desktop application."}
            </span>
          </div>
          {network && (
            <span className="meta-chip">
              <Server size={17} />
              {network.interfaces.length} interfaces
            </span>
          )}
        </div>
        {error && (
          <div className="notice error" role="alert">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        <form
          className="scanner-controls"
          onSubmit={(e) => {
            e.preventDefault();
            void scan();
          }}
        >
          <label className="field-label">
            IPv4 subnet
            <input
              dir="ltr"
              className="input-field"
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="192.168.1.0/24"
              disabled={!native || scanning}
            />
          </label>
          <button
            className="btn btn-primary"
            disabled={!native || scanning || !subnet.trim()}
          >
            <Search size={18} className={scanning ? "spin" : ""} />
            {scanning ? "Scanning…" : "Scan network"}
          </button>
          <label className="checkbox-label">
            <input
              dir="auto"
              type="checkbox"
              checked={onlyStrips}
              onChange={(e) => setOnlyStrips(e.target.checked)}
            />
            MTTL candidates only
          </label>
          <span className="small-muted">
            {scanned
              ? `${visible.length} shown / ${hosts.length} discovered`
              : "254 addresses · /24 network"}
          </span>
        </form>
        {selectedHosts.length > 0 && (
          <div className="selection-toolbar">
            <span>{selectedHosts.length} setup endpoints selected</span>
            <button
              className="btn btn-primary"
              onClick={() => onSelectForProvision(selectedHosts.map(target))}
            >
              Set up selected
              <ArrowRight size={18} />
            </button>
            <button className="btn btn-glass" onClick={() => setSelected([])}>
              Clear selection
            </button>
          </div>
        )}
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>IP address</th>
                <th>MAC / identity</th>
                <th>Controller status</th>
                <th>Setup :30300</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((host) => {
                  const known = matchHostDevice(host, devices);
                  const removed = matchHostDevice(host, removedDevices);
                  return (
                    <tr key={host.ip}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${host.ip} for setup`}
                          checked={selected.includes(host.ip)}
                          disabled={!host.setup_port_open || !!known?.online}
                          onChange={(e) =>
                            setSelected((previous) =>
                              e.target.checked
                                ? [...previous, host.ip]
                                : previous.filter((ip) => ip !== host.ip),
                            )
                          }
                        />
                      </td>
                      <td className="mono">
                        <bdi dir="ltr">{host.ip}</bdi>
                      </td>
                      <td>
                        <span className="mono">
                          {host.mac || "Unknown MAC"}
                        </span>
                        <span className="table-secondary">
                          <bdi data-i18n="off" dir="auto">
                            {known?.alias || removed?.alias
                              ? displayName(
                                  known?.alias || removed?.alias || "",
                                )
                              : host.hostname ||
                                host.vendor ||
                                t("Identity unavailable")}
                          </bdi>
                        </span>
                      </td>
                      <td>
                        <span
                          className={`tag-badge ${known?.online ? "ok" : removed ? "warn" : "neutral"}`}
                        >
                          {known
                            ? known.online
                              ? "Connected"
                              : "Registered · offline"
                            : removed
                              ? "Removed"
                              : "Unregistered candidate"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`tag-badge ${host.setup_port_open ? "ok" : "neutral"}`}
                        >
                          {host.setup_port_open ? "Open" : "Closed"}
                        </span>
                      </td>
                      <td>
                        <div className="action-row">
                          <button
                            className="btn btn-glass btn-icon"
                            aria-label={`Copy ${host.ip}`}
                            onClick={() => void copy(host.ip)}
                          >
                            {copied === host.ip ? (
                              <Check size={16} />
                            ) : (
                              <Copy size={16} />
                            )}
                          </button>
                          {known ? (
                            <button
                              className="btn btn-glass btn-small"
                              onClick={() => onSelectDevice(known.mac)}
                            >
                              View strip
                            </button>
                          ) : removed ? (
                            <button
                              className="btn btn-glass btn-small"
                              onClick={() => void onRestore(removed.mac)}
                            >
                              Add back
                            </button>
                          ) : (
                            <button
                              className="btn btn-glass btn-small"
                              onClick={() => openAdd(host)}
                            >
                              <Plus size={15} />
                              Add strip
                            </button>
                          )}
                          {host.setup_port_open && !known?.online && (
                            <button
                              className="btn btn-glass btn-small"
                              onClick={() =>
                                onSelectForProvision([target(host)])
                              }
                            >
                              <Wifi size={15} />
                              Set up
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="table-empty">
                    {scanning
                      ? "Probing network addresses. Results appear after the scan finishes."
                      : !native
                        ? "Network discovery is available in the desktop application."
                        : scanned
                          ? onlyStrips && hosts.length
                            ? "No MTTL candidates match this filter."
                            : "No reachable hosts found. Check the subnet, adapter, and network isolation."
                          : "Scan a subnet to find equipment. Strips in Wi-Fi setup mode are also listed under Device setup."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="technical-note">
          <Radio size={20} />
          <p>
            A vendor address or open port identifies a candidate, not a
            confirmed MTTL strip. Adding a record does not connect the device:
            its configured controller IP must point to this computer, and it
            must send valid boot information on TCP 10086.
          </p>
        </div>
      </section>
      {adding && (
        <ConfirmDialog
          title="Add an existing physical strip"
          confirmLabel="Add strip"
          busy={addingBusy}
          onConfirm={() => {
            void add();
          }}
          onClose={() => setAdding(null)}
        >
          {addError && (
            <div className="notice error" role="alert">
              {operationError || addError}
            </div>
          )}
          <p>
            Register a strip that is already on your network. Its identity,
            firmware, and live values will be verified after it connects.
          </p>
          <label className="field-label">
            Strip name
            <input
              dir="auto"
              className="input-field"
              value={adding.alias}
              maxLength={80}
              disabled={addingBusy}
              onChange={(e) => setAdding({ ...adding, alias: e.target.value })}
            />
          </label>
          <label className="field-label">
            Physical device MAC
            <input
              dir="ltr"
              className="input-field mono"
              value={adding.mac}
              placeholder="D8:AA:59:DC:41:CD"
              disabled={addingBusy}
              onChange={(e) => setAdding({ ...adding, mac: e.target.value })}
            />
          </label>
          <label className="field-label">
            Device IPv4 address
            <input
              dir="ltr"
              className="input-field"
              value={adding.ip}
              placeholder="192.168.1.45"
              disabled={addingBusy}
              onChange={(e) => setAdding({ ...adding, ip: e.target.value })}
            />
          </label>
        </ConfirmDialog>
      )}
    </>,
  );
}
