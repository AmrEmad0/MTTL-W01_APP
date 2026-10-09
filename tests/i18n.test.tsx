import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  displayName,
  getLanguage,
  initialLanguage,
  localize,
  localeTag,
  setLanguage,
  t,
} from "../src/i18n";
import { OutletItem } from "../src/components/OutletItem";
import { Navbar } from "../src/components/Navbar";
import { UsageChart } from "../src/components/UsageChart";
import { ConfirmDialog } from "../src/components/ConfirmDialog";
import type { OutletState } from "../src/types";

beforeEach(() => setLanguage("ar"));
afterEach(() => setLanguage("en"));
describe("Arabic operating interface", () => {
  test("Arabic is the default without a saved preference, and English switching is reversible", () => {
    expect(initialLanguage()).toBe("ar");
    expect(getLanguage()).toBe("ar");
    expect(t("Power overview")).toBe("نظرة عامة على الطاقة");
    expect(localeTag()).toStartWith("ar-EG");
    setLanguage("en");
    expect(t("Power overview")).toBe("Power overview");
    expect(localeTag()).toBe("en-GB");
  });
  test("all navigation destinations and accessible actions are Arabic", () => {
    const html = renderToStaticMarkup(
      <Navbar
        language="ar"
        theme="dark"
        setupBusy={false}
        activeTab="history"
        setActiveTab={() => {}}
        connectedCount={2}
        server={null}
        native={false}
        busy={false}
        onRefreshAll={() => {}}
        onAllStripsOff={() => {}}
        onToggleTheme={() => {}}
      />,
    );
    for (const text of [
      "نظرة عامة على الطاقة",
      "اكتشاف أجهزة الشبكة",
      "تهيئة الأجهزة",
      "الاستهلاك والسجل",
      "الجداول والسيناريوهات",
      "محلّل القدرة",
      "إدارة البيانات",
      "سجل النشاط",
      "وحدة أوامر البروتوكول",
    ])
      expect(html).toContain(text);
    expect(html).toContain('aria-label="التبديل إلى الوضع الفاتح"');
    expect(html).toContain('aria-label="Switch to English"');
    expect(html).not.toContain("TCP service active");
  });
  test("equipment identity and protocol bytes are preserved even when they match interface words", () => {
    const action = () => {};
    const original = (
      <button key="relay" onClick={action} title="Reboot strip">
        <bdi data-i18n="off" dir="auto">
          Online
        </bdi>
        <code data-i18n="off">up:onoff:1:on</code>Reboot strip
      </button>
    );
    const translated = localize(original);
    expect(translated.key).toBe("relay");
    expect(translated.props.onClick).toBe(action);
    const html = renderToStaticMarkup(translated);
    expect(html).toContain(">Online</bdi>");
    expect(html).toContain("up:onoff:1:on");
    expect(html).toContain("إعادة تشغيل المشترك");
    expect(displayName("Online")).toBe("Online");
    expect(displayName("لوحة المصنع")).toBe("لوحة المصنع");
    expect(displayName("Strip 41CD")).toContain("مشترك");
    expect(displayName("Outlet 3")).toBe("المقبس 3");
  });
  test("freshness, protection, and confirmation messages retain their operational meaning", () => {
    expect(t("Channel 3: switching off")).toContain("إيقاف المقبس 3");
    expect(t("2 offline · 5 registered")).toBe("2 غير متصل · 5 مسجّل");
    expect(t("12s ago")).toBe("منذ 12 ثانية");
    expect(t("Partial data · 1 of 3 connected strips")).toContain(
      "بيانات جزئية",
    );
    expect(t("Outlet name — confirmed by the device.")).toContain(
      "أكّد الجهاز التنفيذ",
    );
    expect(t("Overheat / Thermal Cutoff Trip")).toContain("فصل وقائي");
  });
  test("provisioning and backend messages are translated while addresses remain exact", () => {
    expect(t("Boot registration model=lgutap, fw=0.1.54")).toContain("lgutap");
    expect(t("Strip acknowledged controller address 192.168.1.10")).toContain(
      "192.168.1.10",
    );
    expect(
      t("Device with MAC 001122334455 is not currently connected"),
    ).toContain("غير متصل حاليًا");
    const message =
      "Settings acknowledged and reboot command sent. Awaiting runtime connection. Settings were sent. Restore the destination network, then check the connection before retrying setup.";
    expect(t(message)).not.toMatch(/Settings|Awaiting|Restore/);
    expect(
      t("No acknowledgement received within 4000 ms for up:ip:ip_ok"),
    ).toContain("up:ip:ip_ok");
  });
  test("a protected Arabic outlet remains disabled and its operator name is preserved", () => {
    const now = Math.floor(Date.now() / 1000);
    const outlet: OutletState = {
      channel: 2,
      custom_name: "Online",
      icon: "plug",
      on: false,
      power_w: 0,
      estimated_current_a: 0,
      energy_kwh: 0,
      secondary_energy_kwh: 0,
      energy_budget_kwh: 0,
      temperature_c: 85,
      event_code: "02",
      event_desc: "Overheat / Thermal Cutoff Trip",
      overload_ok: true,
      overheat_ok: false,
      countdown_sec: 0,
      standby_threshold_w: 3,
      standby_cutoff_enabled: false,
      updated_at: now,
      telemetry_at: now,
      report_revision: 1,
    };
    const html = renderToStaticMarkup(
      <OutletItem
        outlet={outlet}
        online
        controlsAvailable
        pending={false}
        onToggle={() => {}}
        onUpdateName={async () => true}
      />,
    );
    expect(html).toContain(">Online</bdi>");
    expect(html).toContain('aria-label="تشغيل المقبس 2"');
    expect(html).toMatch(/role="switch"[^>]*disabled/);
    expect(html).toContain("فصل وقائي بسبب ارتفاع الحرارة");
  });
  test("charts localize titles and accessible readings, preserving real units and chronological direction", () => {
    const html = renderToStaticMarkup(
      <UsageChart
        title="Active power"
        unit="W"
        metric="average_power_w"
        points={[
          {
            timestamp: 1000,
            average_power_w: 42,
            peak_power_w: 42,
            temperature_c: 25,
            energy_kwh: 0,
            samples: 1,
          },
        ]}
        bucketSeconds={10}
        from={1000}
        to={1020}
      />,
    );
    expect(html).toContain("القدرة الفعّالة");
    expect(html).toContain("42.0 W");
    expect(html).toContain("فترة تجميع مسجلة");
    expect(html).toContain("استعراض قراءات القدرة الفعّالة");
    expect(html).not.toContain("recorded time buckets");
  });
  test("destructive dialogs translate actions and preserve the selected strip identity", () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        title="Remove Strip 41CD?"
        confirmLabel="Remove strip"
        busy={false}
        danger
        onConfirm={() => {}}
        onClose={() => {}}
      >
        Incoming connections are ignored until you add a strip back. Saved names
        and history are retained.
      </ConfirmDialog>,
    );
    expect(html).toContain("إزالة");
    expect(html).toContain("41CD");
    expect(html).toContain("إغلاق النافذة");
    expect(html).toContain("تبقى الأسماء والسجل محفوظة");
    expect(html).not.toContain("Remove strip");
  });
});
