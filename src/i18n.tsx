import {
  cloneElement,
  isValidElement,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { arabic } from "./locales/ar";

export type Language = "ar" | "en";
export function initialLanguage(): Language {
  try {
    return localStorage.getItem("mttl-language") === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}
let language: Language =
  typeof window === "undefined" ? "en" : initialLanguage();
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export const localeTag = () =>
  language === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
export function applyLanguage(value: Language): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = value;
    document.documentElement.dir = value === "ar" ? "rtl" : "ltr";
    document.title =
      value === "ar"
        ? "MTTL Control | إدارة الطاقة"
        : "MTTL Control | Power Control";
  }
  try {
    localStorage.setItem("mttl-language", value);
  } catch {
    /* Language still works without storage. */
  }
}
export function setLanguage(value: Language): void {
  language = value;
  applyLanguage(value);
  listeners.forEach((listener) => listener());
}
export function useLanguage(): Language {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getLanguage,
    getLanguage,
  );
}
const isolate = (text: string) => `\u2068${text}\u2069`;
const powerState = (text: string) => (/on/i.test(text) ? "تشغيل" : "إيقاف");
const patterns: [RegExp, (...parts: string[]) => string][] = [
  [/^(\d+)s ago$/, (n) => `منذ ${n} ثانية`],
  [/^(\d+)m ago$/, (n) => `منذ ${n} دقيقة`],
  [/^(\d+)h ago$/, (n) => `منذ ${n} ساعة`],
  [/^Strip ([A-F\d]{4})$/i, (id) => `مشترك ${isolate(id)}`],
  [/^Outlet ([1-4])$/, (n) => `المقبس ${n}`],
  [/^Channel ([1-4]) name$/, (n) => `اسم المقبس ${n}`],
  [/^Rename channel ([1-4])$/, (n) => `تغيير اسم المقبس ${n}`],
  [/^Channel ([1-4]) power$/, (n) => `تشغيل المقبس ${n}`],
  [/^Switch (on|off)$/, (state) => powerState(state)],
  [
    /^(On|Off) · last reported$/,
    (state) => `${t(state)} · آخر حالة مُبلّغ عنها`,
  ],
  [
    /^Channel ([1-4]): switching (on|off)$/,
    (n, state) => `جارٍ ${powerState(state)} المقبس ${n}`,
  ],
  [
    /^(.+): switching all outlets (on|off)$/,
    (name, state) =>
      `${isolate(displayName(name))}: جارٍ ${powerState(state)} جميع المقابس`,
  ],
  [
    /^Channel ([1-4]): (on|off|unknown)( \(last reported\))?$/,
    (n, state, last) =>
      `المقبس ${n}: ${t(state === "unknown" ? "Unknown" : state === "on" ? "On" : "Off")}${last ? " (آخر حالة مُبلّغ عنها)" : ""}`,
  ],
  [
    /^(Remove|Reboot) (.+)\?$/,
    (action, name) =>
      `${action === "Remove" ? "إزالة" : "إعادة تشغيل"} ${isolate(displayName(name))}؟`,
  ],
  [/^(.+)\?$/, (text) => `${t(text)}؟`],
  [
    /^(\d+) offline · (\d+) registered$/,
    (off, total) => `${off} غير متصل · ${total} مسجّل`,
  ],
  [
    /^Partial data · (\d+) of (\d+) connected strips$/,
    (fresh, total) => `بيانات جزئية · ${fresh} من ${total} مشترك متصل`,
  ],
  [/^(\d+) trips?$/, (n) => `${n} حالة فصل وقائي`],
  [
    /^(\d+) visible removed · (\d+) hidden removed$/,
    (visible, hidden) =>
      `${visible} مشترك مُزال ظاهر · ${hidden} مشترك مُزال مخفي`,
  ],
  [
    /^(\d+) counter resets · (\d+) gap intervals excluded\.$/,
    (resets, gaps) =>
      `استُبعدت ${resets} حالة إعادة ضبط للعداد و${gaps} فجوة زمنية.`,
  ],
  [/^of ([\d,٬]+) records$/, (count) => `من ${count} سجل`],
  [/^outlet ([1-4])$/, (n) => `المقبس ${n}`],
  [/^· outlet ([1-4])$/, (n) => `· المقبس ${n}`],
  [
    /^(.+) \(([A-F\d]{12})\)( · outlet ([1-4]))?$/i,
    (name, mac, _outlet, n) =>
      `${isolate(displayName(name))} (${isolate(mac)})${n ? ` · المقبس ${n}` : ""}`,
  ],
  [
    /^Controller (\S+) · Gateway (\S+)$/,
    (ip, gateway) =>
      `وحدة التحكم ${isolate(ip)} · البوابة ${gateway === "unavailable" ? "غير متاحة" : isolate(gateway)}`,
  ],
  [
    /^(\d+) shown \/ (\d+) discovered$/,
    (shown, total) => `${shown} معروض / ${total} مكتشف`,
  ],
  [/^Select (\S+) for setup$/, (ip) => `اختيار ${isolate(ip)} للتهيئة`],
  [/^Copy (\S+)$/, (ip) => `نسخ ${isolate(ip)}`],
  [
    /^(\d+) setup access points · Current network: (.+)$/,
    (count, ssid) =>
      `${count} نقطة وصول للتهيئة · الشبكة الحالية: ${ssid === "Unknown" ? "غير معروفة" : isolate(ssid)}`,
  ],
  [
    /^AP (.+) ·$/,
    (bssid) =>
      `نقطة الوصول ${bssid === "by SSID" ? "حسب اسم الشبكة" : isolate(bssid)} ·`,
  ],
  [
    /^(.+)\. (\d+) recorded time buckets\.$/,
    (title, count) => `${t(title)}. ${count} فترة تجميع مسجلة.`,
  ],
  [
    /^Inspect (.+) readings$/,
    (title) =>
      `استعراض قراءات ${t(Object.keys(arabic).find((key) => key.toLowerCase() === title) || title)}`,
  ],
  [
    /^Live updates unavailable: (.+)\. Status polling remains active\.$/,
    (error) =>
      `التحديثات المباشرة غير متاحة: ${t(error)}. يستمر تحديث الحالة دوريًا.`,
  ],
  [
    /^(.+) — confirmed by the device\.$/,
    (label) => `${t(label)} — أكّد الجهاز التنفيذ.`,
  ],
  [/^(.+) — saved\.$/, (label) => `${t(label)} — تم الحفظ.`],
  [
    /^Unable to copy address: (.+)$/,
    (error) => `تعذّر نسخ العنوان: ${t(error)}`,
  ],
  [
    /^No verified new connection within 60 seconds\. Check strip power, Wi-Fi credentials, the controller IP, and TCP port (\d+)\.(.*)$/,
    (port, error) =>
      `لم يصل اتصال جديد مؤكّد خلال 60 ثانية. تحقّق من كهرباء المشترك وبيانات Wi-Fi وعنوان وحدة التحكم ومنفذ TCP ${port}.${error ? ` ${t(error.trim())}` : ""}`,
  ],
  [
    /^Disconnected from (.+)$/,
    (endpoint) => `انقطع الاتصال مع ${isolate(endpoint)}`,
  ],
  [
    /^Boot registration model=(.+), fw=(.+)$/,
    (model, fw) =>
      `تسجيل بدء التشغيل · الطراز ${isolate(model)} · البرنامج الثابت ${isolate(fw)}`,
  ],
  [
    /^Outlet ([1-4]) turned (ON|OFF)$/,
    (n, state) => `تم ${powerState(state)} المقبس ${n}`,
  ],
  [
    /^Wi-Fi discovery unavailable: (.+)$/,
    (error) => `اكتشاف Wi-Fi غير متاح: ${isolate(error)}`,
  ],
  [
    /^Failed to send command to device queue: (.+)$/,
    (error) => `تعذّر إرسال الأمر إلى قائمة الجهاز: ${isolate(error)}`,
  ],
  [
    /^Device with MAC (.+) is not currently connected$/,
    (mac) => `الجهاز ذو عنوان MAC ${isolate(mac)} غير متصل حاليًا`,
  ],
  [
    /^Cannot listen on (.+): (.+)$/,
    (endpoint, error) =>
      `تعذّر استقبال الاتصالات على ${isolate(endpoint)}: ${isolate(error)}`,
  ],
  [
    /^Device (.+) is not connected$/,
    (mac) => `الجهاز ${isolate(mac)} غير متصل`,
  ],
  [
    /^Could not connect to (.+): (.+)\. Ensure you are connected to TONLY_TAP_\* Wi-Fi AP\.$/,
    (endpoint, error) =>
      `تعذّر الاتصال بـ ${isolate(endpoint)}: ${isolate(error)}. تأكّد من اتصالك بنقطة وصول Wi-Fi للمشترك التي يبدأ اسمها بـ TONLY_TAP_.`,
  ],
  [
    /^Connection to (.+) failed: (.+)$/,
    (endpoint, error) =>
      `فشل الاتصال بـ ${isolate(endpoint)}: ${isolate(error)}`,
  ],
  [
    /^Timed out after 5000ms connecting to (.+)$/,
    (endpoint) =>
      `انتهت مهلة الاتصال بعد 5 ثوانٍ عند الاتصال بـ ${isolate(endpoint)}`,
  ],
  [
    /^Successfully established TCP socket with (.+)\.$/,
    (endpoint) => `تم إنشاء اتصال TCP مع ${isolate(endpoint)}.`,
  ],
  [
    /^Strip acknowledged controller address (.+)$/,
    (ip) => `أكّد المشترك عنوان وحدة التحكم ${isolate(ip)}`,
  ],
  [
    /^Strip acknowledged Wi-Fi settings for '(.+)'$/,
    (ssid) => `أكّد المشترك إعدادات Wi-Fi للشبكة ${isolate(ssid)}`,
  ],
  [
    /^Failed to write IP command: (.+)$/,
    (error) => `تعذّر إرسال أمر عنوان IP: ${isolate(error)}`,
  ],
  [
    /^Failed to send Wi-Fi command: (.+)$/,
    (error) => `تعذّر إرسال أمر Wi-Fi: ${isolate(error)}`,
  ],
  [
    /^Strip closed the connection before acknowledging (.+)$/,
    (frame) => `أغلق المشترك الاتصال قبل تأكيد ${isolate(frame)}`,
  ],
  [
    /^Strip did not acknowledge (.+)\. Check the device configuration\.$/,
    (frame) => `لم يؤكّد المشترك ${isolate(frame)}. تحقّق من إعدادات الجهاز.`,
  ],
  [
    /^Setup response could not be read: (.+)$/,
    (error) => `تعذّرت قراءة استجابة التهيئة: ${isolate(error)}`,
  ],
  [
    /^No acknowledgement received within (\d+) ms for (.+)$/,
    (ms, frame) => `لم يصل تأكيد خلال ${ms} مللي ثانية للأمر ${isolate(frame)}`,
  ],
  [
    /^Could not join '(.+)'\. Check the password, adapter, and AP availability\.$/,
    (ssid) =>
      `تعذّر الاتصال بالشبكة ${isolate(ssid)}. تحقّق من كلمة المرور ومحوّل الشبكة وتوفر نقطة الوصول.`,
  ],
  [
    /^Reconnected to '(.+)'$/,
    (ssid) => `أُعيد الاتصال بالشبكة ${isolate(ssid)}`,
  ],
  [
    /^Reconnect this computer to '(.+)' manually before continuing\.$/,
    (ssid) => `أعد توصيل الحاسوب بالشبكة ${isolate(ssid)} يدويًا قبل المتابعة.`,
  ],
  [
    /^(.+) (Settings were sent\. Restore the destination network, then check the connection before retrying setup\.|Correct the reported issue, then retry setup\.)$/,
    (message, instruction) => `${t(message)} ${t(instruction)}`,
  ],
  [
    /^(.+) Computer Wi-Fi was restored\.$/,
    (message) => `${t(message)} استُعيد اتصال Wi-Fi للحاسوب.`,
  ],
  [
    /^Connect and pair smart power strips one by one to your Wi-Fi network and controller\. \((\d+) strip\(s\) connected\)$/,
    (count) =>
      `قم بتهيئة وإقران المشتركات الذكية واحدًا تلو الآخر بشبكة Wi-Fi ووحدة التحكم. (${count} مشترك متصل)`,
  ],
  [
    /^(\d+) strip\(s\) detected in setup mode · Current Wi-Fi: (.+)$/,
    (count, ssid) =>
      `${count} مشترك مكتشف في وضع التهيئة · شبكة Wi-Fi الحالية: ${ssid === "None" ? "لا توجد" : isolate(ssid)}`,
  ],
  [
    /^Comparing (\d+) outlets side-by-side$/,
    (count) => `مقارنة ${count} مقابس جنبًا إلى جنب`,
  ],
  [
    /^Calculated across (\d+) matched time buckets$/,
    (buckets) => `محسوب عبر ${buckets} فترات تجميع متزامنة`,
  ],
  [/^Est\. cost: \$([\d.]+)$/, (cost) => `التكلفة التقديرية: $${cost}`],
  [/^Average:\s*([\d.—]+)\s*W$/i, (w) => `المتوسط: ${w} واط`],
  [/^Average:\s*(.+)$/i, (val) => `المتوسط: ${t(val)}`],
  [/^Standby:\s*(.+)$/i, (time) => `الاستعداد: ${t(time)}`],
  [/^(\d+)\s*min\s*(\d+)\s*s$/i, (m, s) => `${m} دقيقة ${s} ث`],
  [/^(\d+)\s*min$/i, (m) => `${m} دقيقة`],
  [/^(\d+)\s*s$/i, (s) => `${s} ث`],
  [/^([\d.]+)\s*h$/i, (h) => `${h} ساعة`],
  [
    /^\/\s*(\d+)\s*frames\s*·\s*newest first$/i,
    (n) => `/ ${n} إطار · الأحدث أولاً`,
  ],
  [/^(\d+)\s*B$/i, (b) => `${b} بايت`],
  [
    /^Frame '(.+)' queued\. Inspect received frames below to verify the device response\.$/,
    (cmd) =>
      `تم إدراج الإطار '${cmd}' في قائمة الانتظار. راجع الإطارات الواردة أدناه للتحقق من استجابة الجهاز.`,
  ],
  [
    /^Outlet ([1-4]): (ON|OFF)$/,
    (n, state) => `المقبس ${n}: ${state === "ON" ? "تشغيل" : "إيقاف"}`,
  ],
  [/^BSSID: (.+)$/, (bssid) => `عنوان BSSID: ${isolate(bssid)}`],
  [/^Pairing (.+)…$/, (name) => `جارٍ اقتران ${isolate(name)}…`],
  [/^(\d+) active monitoring rule\(s\)$/, (n) => `${n} قواعد مراقبة نشطة`],
  [
    /^Connecting to strip Wi-Fi \((.+)\)…$/,
    (ssid) => `جارٍ الاتصال بشبكة Wi-Fi للمشترك (${isolate(ssid)})…`,
  ],
  [
    /^Connecting to strip endpoint at (.+)…$/,
    (endpoint) => `جارٍ الاتصال بنقطة نهاية المشترك على ${isolate(endpoint)}…`,
  ],
  [/^(\d+)s$/, (s) => `${s}ث`],
];

/** Translate interface copy only. Database names and protocol payloads explicitly opt out. */
export function t(source: string): string {
  if (language === "en" || !source.trim()) return source;
  const text = source.trim().replace(/\s+/g, " ");
  let translated = arabic[text];
  if (translated === undefined) {
    for (const [pattern, render] of patterns) {
      const match = text.match(pattern);
      if (match) {
        translated = render(...match.slice(1));
        break;
      }
    }
  }
  // Operation errors carry a translated label followed by the backend explanation.
  if (translated === undefined) {
    const separator = text.indexOf(": ");
    if (separator > 0 && arabic[text.slice(0, separator)])
      translated = `${t(text.slice(0, separator))}: ${t(text.slice(separator + 2))}`;
  }
  if (translated === undefined) return source;
  return `${/^\s/.test(source) ? " " : ""}${translated}${/\s$/.test(source) ? " " : ""}`;
}
/** Only generated defaults are localized; operator-entered equipment names remain verbatim. */
export function displayName(name: string): string {
  return /^(Strip [A-F\d]{4}|Outlet [1-4])$/i.test(name) ? t(name) : name;
}

/** Localize the rendered React tree, retaining keys, handlers, refs and technical payloads. */
export function localize<T extends ReactNode>(node: T): T {
  if (language === "en") return node;
  if (typeof node === "string") return t(node) as T;
  if (Array.isArray(node))
    return node.map((child) => localize(child)) as unknown as T;
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.props["data-i18n"] === "off") return node;
  const props: Record<string, unknown> = {};
  if (typeof element.type === "string") {
    for (const key of [
      "title",
      "placeholder",
      "aria-label",
      "aria-valuetext",
      "alt",
    ])
      if (typeof element.props[key] === "string")
        props[key] = t(element.props[key] as string);
  }
  if (element.props.children === undefined)
    return Object.keys(props).length
      ? (cloneElement(element, props) as T)
      : node;
  const children = localize(element.props.children as ReactNode);
  // Passing static siblings as separate children retains React's static-child validation.
  return (
    Array.isArray(children)
      ? cloneElement(element, props, ...children)
      : cloneElement(element, props, children)
  ) as T;
}
