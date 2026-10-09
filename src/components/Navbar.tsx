import { localize, type Language } from "../i18n";
import {
  LayoutGrid,
  Radio,
  Wifi,
  FileText,
  Terminal,
  PowerOff,
  RefreshCw,
  Cable,
  Moon,
  Sun,
  ChartNoAxesCombined,
  Database,
  Languages,
  CalendarClock,
  Activity,
} from "lucide-react";
import type { Theme } from "../theme";
import type { ServerStatus } from "../types";

interface NavbarProps {
  language?: Language;
  onToggleLanguage?: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  setupBusy: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  connectedCount: number;
  server: ServerStatus | null;
  native: boolean;
  busy: boolean;
  onAllStripsOff: () => void;
  onRefreshAll: () => void;
}
const tabs = [
  { id: "dashboard", label: "Power overview", icon: LayoutGrid },
  { id: "scanner", label: "Network discovery", icon: Radio },
  { id: "provision", label: "Device setup", icon: Wifi },
  { id: "history", label: "Usage & history", icon: ChartNoAxesCombined },
  { id: "automation", label: "Schedules & scenarios", icon: CalendarClock },
  { id: "analyzer", label: "Power analyzer", icon: Activity },
  { id: "data", label: "Data management", icon: Database },
  { id: "logs", label: "Activity log", icon: FileText },
  { id: "terminal", label: "Protocol console", icon: Terminal },
];
export function Navbar({
  language = "en",
  onToggleLanguage,
  theme,
  onToggleTheme,
  setupBusy,
  activeTab,
  setActiveTab,
  connectedCount,
  server,
  native,
  busy,
  onAllStripsOff,
  onRefreshAll,
}: NavbarProps) {
  return localize(
    <>
      <aside className="sidebar">
        <div className="nav-brand">
          <div className="brand-icon">
            <Cable size={23} />
          </div>
          <div>
            <h1>
              MTTL <span>CONTROL</span>
            </h1>
            <p>Power distribution manager</p>
          </div>
        </div>
        <div className="sidebar-label">OPERATIONS</div>
        <nav className="nav-tabs" aria-label="Main navigation">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-tab-btn ${activeTab === id ? "active" : ""}`}
              disabled={setupBusy && id !== "provision"}
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {activeTab === id && <span className="nav-active-mark" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-label">CONTROLLER</div>
          <div className="controller-status">
            <span
              className={`status-dot ${native && server?.running ? "ok" : ""}`}
            />
            <strong>
              {!native
                ? "Desktop required"
                : !server
                  ? "Checking service"
                  : server.running
                    ? "TCP service active"
                    : "TCP service unavailable"}
            </strong>
          </div>
          <dl className="controller-details">
            <div>
              <dt>Listen port</dt>
              <dd>{native && server ? server.port : "—"}</dd>
            </div>
            <div>
              <dt>Connected strips</dt>
              <dd>
                {native && server
                  ? connectedCount.toString().padStart(2, "0")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Device family</dt>
              <dd>MTTL-W01</dd>
            </div>
          </dl>
          {server?.error && <p className="sidebar-error">{server.error}</p>}
          <div className="sidebar-footer">LG U+ / TONLY</div>
        </div>
      </aside>
      <header className="topbar">
        <div className="breadcrumb">
          Operations <span>/</span>{" "}
          <strong>{tabs.find((t) => t.id === activeTab)?.label}</strong>
        </div>
        <div className="topbar-actions">
          <button
            className="btn btn-glass language-toggle"
            onClick={onToggleLanguage}
            aria-label={
              language === "ar" ? "Switch to English" : "التبديل إلى العربية"
            }
            title={
              language === "ar" ? "Switch to English" : "التبديل إلى العربية"
            }
            data-i18n="off"
          >
            <Languages size={18} />
            <span
              lang={language === "ar" ? "en" : "ar"}
              dir={language === "ar" ? "ltr" : "rtl"}
            >
              {language === "ar" ? "English" : "العربية"}
            </span>
          </button>
          <button
            className="btn btn-glass theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <span className="connection-label">
            <span className={`status-dot ${connectedCount > 0 ? "ok" : ""}`} />
            {connectedCount} connected
          </span>
          <button
            className="btn btn-glass"
            disabled={!native || !connectedCount || busy}
            onClick={onRefreshAll}
          >
            <RefreshCw size={15} />
            <span>Refresh all</span>
          </button>
          <button
            className="btn btn-danger"
            disabled={!native || !connectedCount || busy}
            onClick={onAllStripsOff}
          >
            <PowerOff size={15} />
            <span>All strips off</span>
          </button>
        </div>
      </header>
    </>,
  );
}
