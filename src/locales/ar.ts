import { automationArabic } from "./automation.ar";
// Clear Modern Standard Arabic. Technical protocol tokens remain unchanged.
export const arabic: Record<string, string> = {
  "Join strip Wi-Fi": "اتصل بشبكة المشترك",
  "Return to destination Wi-Fi": "عُد إلى الشبكة المستهدفة",
  "Your next step": "خطوتك التالية",
  "Join the strip's setup Wi-Fi": "اتصل بشبكة Wi-Fi الخاصة بتهيئة المشترك",
  "Open this computer's Wi-Fi menu and choose the strip's setup network.":
    "افتح قائمة Wi-Fi على هذا الحاسوب واختر شبكة تهيئة المشترك.",
  "Enter the strip password shown below.":
    "أدخل كلمة مرور المشترك الموضّحة أدناه.",
  "The strip network may show “No internet”. Stay connected until settings have been sent.":
    "قد تظهر شبكة المشترك باسم «بدون إنترنت». ابقَ متصلاً حتى يكتمل إرسال الإعدادات.",
  "Strip Wi-Fi name": "اسم شبكة Wi-Fi الخاصة بالمشترك",
  "Password to join the strip": "كلمة المرور للاتصال بشبكة المشترك",
  "Use the strip's setup Wi-Fi password. To show its derived password, enter the setup Wi-Fi name under manual setup.":
    "استخدم كلمة مرور شبكة تهيئة المشترك. لعرض كلمة المرور المشتقة، أدخل اسم شبكة التهيئة ضمن التهيئة اليدوية.",
  "This password joins the strip's temporary network. Your destination Wi-Fi credentials above will be sent to the strip.":
    "تُستخدم هذه الكلمة للاتصال بشبكة المشترك المؤقتة. ستُرسل بيانات الشبكة المستهدفة أعلاه إلى المشترك.",
  "If you already joined the strip's Wi-Fi, continue now. Scanning again is not required.":
    "إذا كنت متصلاً بشبكة المشترك بالفعل، تابع الآن. لا يلزم إعادة الفحص.",
  "Return to your destination Wi-Fi": "عُد إلى شبكة Wi-Fi المستهدفة",
  "The strip has accepted the settings and is restarting. Open this computer's Wi-Fi menu and reconnect to the network below.":
    "أكّد المشترك استلام الإعدادات وهو يعيد التشغيل. افتح قائمة Wi-Fi على هذا الحاسوب وأعد الاتصال بالشبكة الموضّحة أدناه.",
  "After reconnecting, check the connection. This does not send the setup settings again.":
    "بعد إعادة الاتصال، تحقّق من اتصال المشترك. لن تُرسل إعدادات التهيئة مرة أخرى.",
  "I am connected — send settings": "أنا متصل — أرسل الإعدادات",
  "I reconnected — check connection": "أعدت الاتصال — تحقّق من اتصال المشترك",
  "Connect this computer to the strip's Wi-Fi. If you are already connected, continue below.":
    "وصّل هذا الحاسوب بشبكة Wi-Fi الخاصة بالمشترك. إذا كنت متصلاً بالفعل، تابع أدناه.",
  "Settings sent. Reconnect this computer to your destination Wi-Fi, then check the strip's connection.":
    "أُرسلت الإعدادات. أعد توصيل هذا الحاسوب بشبكة Wi-Fi المستهدفة، ثم تحقّق من اتصال المشترك.",
  "No verified connection yet. Keep this computer on the destination Wi-Fi. Check the controller address and allow MTTL Control through Windows Firewall on your private network, then check again.":
    "لم يُؤكّد اتصال المشترك بعد. أبقِ هذا الحاسوب متصلاً بالشبكة المستهدفة. تحقّق من عنوان وحدة التحكم واسمح لتطبيق MTTL Control عبر جدار حماية Windows على شبكتك الخاصة، ثم أعد التحقّق.",
  "Stopping setup. Wait for the current operation to finish.":
    "جارٍ إيقاف التهيئة. انتظر انتهاء العملية الحالية.",
  "Enter a valid IPv4 address and ports between 1 and 65535.":
    "أدخل عنوان IPv4 صحيحًا ومنافذ بين 1 و65535.",
  "Ready for guided setup": "جاهز للتهيئة خطوة بخطوة",
  "Controller IPv4 on destination network":
    "عنوان IPv4 لهذا الحاسوب على الشبكة المستهدفة",
  "Keep this computer's destination-network address when joining the strip's Wi-Fi.":
    "احتفظ بعنوان الحاسوب على الشبكة المستهدفة عند الاتصال بشبكة المشترك.",
  "Keep your destination Wi-Fi details below. Choose a strip, join its Wi-Fi with the displayed password, send settings, then reconnect to your destination Wi-Fi and check the connection.":
    "احتفظ ببيانات شبكة Wi-Fi المستهدفة أدناه. اختر مشتركًا، واتصل بشبكته بكلمة المرور المعروضة، ثم أرسل الإعدادات. بعدها عُد إلى الشبكة المستهدفة وتحقّق من اتصال المشترك.",
  "Already connected? Continue without scanning":
    "متصل بالمشترك بالفعل؟ تابع دون فحص",
  "Strip setup Wi-Fi name (optional)": "اسم شبكة تهيئة المشترك (اختياري)",
  "Continue with this strip": "تابع مع هذا المشترك",
  "3. Return to destination Wi-Fi": "3. العودة إلى الشبكة المستهدفة",
  "Keep this computer connected to the strip's setup Wi-Fi, check the strip is in setup mode, then retry. A Wi-Fi connection alone does not send the strip's settings.":
    "أبقِ هذا الحاسوب متصلاً بشبكة تهيئة المشترك وتحقّق من أن المشترك في وضع التهيئة، ثم أعد المحاولة. الاتصال بشبكة Wi-Fi وحده لا يرسل إعدادات المشترك.",
  "Join the strip's Wi-Fi using the displayed password, then choose 'I am connected — send settings'.":
    "اتصل بشبكة المشترك بكلمة المرور المعروضة، ثم اختر «أنا متصل — أرسل الإعدادات».",
  "Wi-Fi password": "كلمة مرور Wi-Fi",
  "Show Wi-Fi password": "إظهار كلمة مرور Wi-Fi",
  "Hide Wi-Fi password": "إخفاء كلمة مرور Wi-Fi",
  "Skip to content": "الانتقال إلى المحتوى",
  "DEVICE SETUP": "تهيئة الأجهزة",
  "Set up strips with your Wi-Fi network and this controller.":
    "هيّئ المشتركات للاتصال بشبكة Wi-Fi ووحدة التحكم هذه.",
  "Refresh interval in seconds": "الفاصل بين التحديثات بالثواني",
  "Average electrical load telemetry over time":
    "متوسط الحمل الكهربائي المُبلّغ عنه مع مرور الوقت",
  "Positive energy accumulation within captured intervals":
    "زيادات عدّاد الطاقة خلال الفترات المسجلة",
  "Reported operating temperature over time":
    "درجة حرارة التشغيل المُبلّغ عنها مع مرور الوقت",
  "At least two counter readings within 30 seconds are required to measure usage.":
    "يلزم وجود قراءتين للعدّاد خلال 30 ثانية لقياس الاستهلاك.",
  "Recorded outlet power on a shared time axis":
    "قدرة المقابس المسجلة على محور زمني مشترك",
  "Loading view…": "جارٍ تحميل الصفحة…",
  "Use your local currency per kWh.":
    "أدخل التعرفة بعملتك المحلية لكل كيلوواط ساعة.",
  "Inspect power comparison readings": "استعراض قراءات مقارنة القدرة",
  ...automationArabic,
  Clear: "مسح",
  Unavailable: "غير متاح",
  RX: "وارد RX",
  TX: "صادر TX",
  "Controller status": "حالة وحدة التحكم",
  "Device endpoint": "عنوان الجهاز ومنفذه",
  "Locally recorded events": "الأحداث المسجلة محليًا",
  Closed: "مغلق",
  "Failed writing controller IP": "تعذّر إرسال عنوان وحدة التحكم",
  "Failed writing Wi-Fi credentials": "تعذّر إرسال بيانات Wi-Fi",
  "connection timeout": "انتهت مهلة الاتصال",
  "No response received for 60 seconds": "لم تصل استجابة خلال 60 ثانية",
  "3,520 W / 16 A at 220 V": "3,520 W / 16 A عند جهد 220 V",
  CONTROL: "التحكم",
  CONTROLLER: "وحدة التحكم",
  OPERATIONS: "التشغيل",
  Operations: "التشغيل",
  "POWER DISTRIBUTION": "توزيع الطاقة",
  "DEVICE DISCOVERY": "اكتشاف الأجهزة",
  "EQUIPMENT COMMISSIONING": "تهيئة الأجهزة",
  "OPERATING HISTORY": "سجل التشغيل",
  "LOCAL STORAGE": "التخزين المحلي",
  "LIVE TRAFFIC": "حركة الاتصال المباشرة",
  "Raw wire data (HEX / unprocessed)":
    "البيانات الأولية الخام (HEX / بدون معالجة)",
  "RECORDED MEASUREMENTS": "القياسات المسجلة",
  "DEVICE DIAGNOSTICS": "تشخيص الجهاز",
  "SELECTED POWER STRIP": "مشترك الكهرباء المحدد",
  "NO DEVICE DATA": "لا توجد بيانات من الأجهزة",
  "Power distribution manager": "إدارة توزيع الطاقة",
  "Power overview": "نظرة عامة على الطاقة",
  "Network discovery": "اكتشاف أجهزة الشبكة",
  "Device setup": "تهيئة الأجهزة",
  "Usage & history": "الاستهلاك والسجل",
  "Data management": "إدارة البيانات",
  "Activity log": "سجل النشاط",
  "Protocol console": "وحدة أوامر البروتوكول",
  "Main navigation": "التنقل الرئيسي",
  "Desktop required": "يلزم تطبيق سطح المكتب",
  "Checking service": "جارٍ التحقق من الخدمة",
  "TCP service active": "خدمة TCP تعمل",
  "TCP service unavailable": "خدمة TCP غير متاحة",
  "Listen port": "منفذ الاستقبال",
  "Connected strips": "المشتركات المتصلة",
  "Device family": "طراز الأجهزة",
  "Light mode": "الوضع الفاتح",
  "Dark mode": "الوضع الداكن",
  "Switch to light mode": "التبديل إلى الوضع الفاتح",
  "Switch to dark mode": "التبديل إلى الوضع الداكن",
  "Refresh all": "تحديث الكل",
  "All strips off": "إيقاف جميع المشتركات",
  Refresh: "تحديث",
  "Refresh counts": "تحديث الأعداد",
  "All off": "إيقاف الكل",
  "All on": "تشغيل الكل",
  "Add strip": "إضافة مشترك",
  "Add strips": "إضافة مشتركات",
  "Add back": "إعادة الإضافة",
  "Add by MAC / IP": "إضافة بعنوان MAC أو IP",
  "Add an existing physical strip": "إضافة مشترك فعلي موجود",
  "Add selected to queue (": "إضافة المحدد إلى قائمة التهيئة (",
  "Start / continue (": "بدء / متابعة (",
  "Set up selected": "تهيئة المحدد",
  "Clear selection": "إلغاء التحديد",
  "Remove strip": "إزالة المشترك",
  "Reboot strip": "إعادة تشغيل المشترك",
  "Rename strip": "تغيير اسم المشترك",
  "Rename outlet": "تغيير اسم المقبس",
  "Rename selected outlet": "تغيير اسم المقبس المحدد",
  Rename: "تغيير الاسم",
  Save: "حفظ",
  "Save name": "حفظ الاسم",
  "Save outlet name": "حفظ اسم المقبس",
  Cancel: "إلغاء",
  "Cancel rename": "إلغاء تغيير الاسم",
  "Close dialog": "إغلاق النافذة",
  "Dismiss notification": "إغلاق الإشعار",
  Retry: "إعادة المحاولة",
  "Loading…": "جارٍ التحميل…",
  "Working…": "جارٍ التنفيذ…",
  Online: "متصل",
  Offline: "غير متصل",
  On: "يعمل",
  Off: "متوقف",
  ON: "يعمل",
  OFF: "متوقف",
  Unknown: "غير معروف",
  Unverified: "لم يتم التحقق",
  OK: "سليم",
  TRIP: "فصل وقائي",
  Enabled: "مفعّل",
  Disabled: "غير مفعّل",
  Normal: "طبيعي",
  Queued: "في الانتظار",
  Paused: "متوقف مؤقتًا",
  Connected: "متصل",
  Controller: "وحدة التحكم",
  "Not recorded": "لم يُسجّل",
  "Not received": "لم تصل بيانات",
  "Just now": "الآن",
  "Awaiting telemetry": "بانتظار القياسات",
  "Stale telemetry": "قياسات قديمة",
  "Protection trip": "فصل وقائي",
  "Needs attention": "يتطلب المراجعة",
  "Applying settings": "جارٍ تطبيق الإعدادات",
  "Waiting for connection": "بانتظار الاتصال",
  "Connected · verified": "متصل · تم التحقق",
  "Confirm device identity": "تأكيد هوية الجهاز",
  "Awaiting data": "بانتظار البيانات",
  "Awaiting relay state": "بانتظار حالة المرحّل",
  "Device offline": "الجهاز غير متصل",
  "Strip is offline": "المشترك غير متصل",
  "Awaiting confirmation": "بانتظار التأكيد",
  "Waiting for device confirmation": "بانتظار تأكيد الجهاز",
  "Relay state not yet received": "لم تصل حالة المرحّل بعد",
  "No current telemetry": "لا توجد قياسات حديثة",
  "Identity unavailable": "الهوية غير متاحة",
  "Protection status": "حالة الحماية",
  Protection: "الحماية",
  Overload: "تجاوز الحمل",
  Thermal: "الحماية الحرارية",
  "Overload and thermal checks clear":
    "الحماية من تجاوز الحمل وارتفاع الحرارة سليمة",
  "Review affected outlets below": "راجع المقابس المتأثرة أدناه",
  "Total live power": "إجمالي القدرة الحالية",
  "Active power": "القدرة الفعّالة",
  Power: "القدرة",
  "Average load": "متوسط الحمل",
  "Peak load": "أقصى حمل",
  "Highest captured load": "أعلى حمل مسجّل",
  "Estimated current": "التيار المقدّر",
  "Est. current": "التيار المقدّر",
  "Calculated at 220 V": "محسوب عند جهد 220 V",
  "Rated capacity": "السعة المقننة",
  "Energized outlets": "المقابس التي تعمل",
  "From strips with current telemetry": "من المشتركات ذات القياسات الحديثة",
  "Across all connected strips": "عبر جميع المشتركات المتصلة",
  "From the physical strip label": "من الملصق الموجود على المشترك",
  "Last reported power": "آخر قدرة مُبلّغ عنها",
  "Last telemetry": "آخر قياسات",
  Temperature: "درجة الحرارة",
  "Highest temperature": "أعلى درجة حرارة",
  Energy: "الطاقة",
  "Observed energy": "الطاقة المرصودة",
  "Electricity usage": "استهلاك الكهرباء",
  "Energy counter": "عداد الطاقة",
  "Secondary counter": "العداد الثانوي",
  "Energy budget": "حد الطاقة",
  "Captured counter increases": "الزيادات المسجلة في العداد",
  "Mean of recorded samples": "متوسط القراءات المسجلة",
  "Observed energy in the selected interval":
    "الطاقة المرصودة خلال الفترة المحددة",
  Current: "التيار",
  Relay: "المرحّل",
  Outlet: "المقبس",
  Strip: "المشترك",
  "Outlet control": "التحكم في المقابس",
  "Outlet energized": "المقبس يعمل",
  "Outlet switched off": "المقبس متوقف",
  "Outlet name": "اسم المقبس",
  "Strip name": "اسم المشترك",
  "Outlet measurements": "قياسات المقابس",
  "Outlet history & usage": "سجل المقبس واستهلاكه",
  "Strip details": "تفاصيل المشترك",
  History: "السجل",
  "History selection": "اختيار السجل",
  "Usage by outlet": "الاستهلاك حسب المقبس",
  "Whole strip · all four outlets": "المشترك كاملًا · المقابس الأربعة",
  "All outlets": "جميع المقابس",
  "All strips": "جميع المشتركات",
  "Selected strip only": "المشترك المحدد فقط",
  "Selected outlet": "المقبس المحدد",
  "Saved strips": "المشتركات المحفوظة",
  "Saved telemetry records": "سجلات القياسات المحفوظة",
  Equipment: "الأجهزة",
  "Equipment register": "سجل الأجهزة",
  "Registered equipment": "الأجهزة المسجلة",
  "Registered · offline": "مسجّل · غير متصل",
  "Unregistered candidate": "جهاز محتمل غير مسجّل",
  "Removed strips": "المشتركات المُزالة",
  Removed: "أُزيل",
  "Target strip": "المشترك المستهدف",
  Connection: "الاتصال",
  "MAC address": "عنوان MAC",
  "MAC / identity": "عنوان MAC / الهوية",
  "Unknown MAC": "عنوان MAC غير معروف",
  "IP address": "عنوان IP",
  "Model / firmware": "الطراز / البرنامج الثابت",
  Notes: "ملاحظات",
  Event: "الحدث",
  Events: "الأحداث",
  Details: "التفاصيل",
  Time: "الوقت",
  "Date / time": "التاريخ / الوقت",
  Action: "الإجراء",
  Actions: "الإجراءات",
  Period: "الفترة",
  From: "من",
  To: "إلى",
  "Last hour": "آخر ساعة",
  "Last 24 hours": "آخر 24 ساعة",
  "Last 7 days": "آخر 7 أيام",
  "Last 30 days": "آخر 30 يومًا",
  "Custom dates": "فترة مخصصة",
  "Select a saved strip": "اختر مشتركًا محفوظًا",
  "Select a connected strip": "اختر مشتركًا متصلًا",
  Select: "اختيار",
  Open: "مفتوح",
  CH: "القناة",
  Countdown: "العد التنازلي",
  "Reported countdown:": "العد التنازلي المُبلّغ عنه:",
  "Standby threshold": "عتبة الاستعداد",
  "Standby cutoff": "فصل الحمل في وضع الاستعداد",
  "Standby cutoff:": "فصل الحمل في وضع الاستعداد:",
  "Fresh telemetry and clear protection required to switch on":
    "يتطلب التشغيل قياسات حديثة وحماية سليمة",
  "Requires current telemetry with no protection trips":
    "يلزم وجود قياسات حديثة دون فصل وقائي",
  "Current telemetry required": "يلزم وجود قياسات حديثة",
  "Switch on all four outlets": "تشغيل المقابس الأربعة",
  "Refresh telemetry": "تحديث القياسات",
  "Monitor connected equipment and manage each outlet.":
    "راقب الأجهزة المتصلة وتحكّم في كل مقبس.",
  "Connection, telemetry, and relay status for every strip.":
    "حالة الاتصال والقياسات والمرحّلات لكل مشترك.",
  "Relay states change after device confirmation.":
    "تتغير حالة المرحّل بعد تأكيد الجهاز.",
  "Controls are disabled until the connection recovers.":
    "تظل أدوات التحكم معطّلة حتى عودة الاتصال.",
  "Telemetry is missing or older than 30 seconds. Refresh the strip to verify measurements and protection status.":
    "القياسات مفقودة أو أقدم من 30 ثانية. حدّث بيانات المشترك للتحقق من القياسات وحالة الحماية.",
  "This strip is offline. Measurements and relay states are last reported values. Switching is disabled.":
    "هذا المشترك غير متصل. تُعرض آخر قياسات وحالات مرحّلات مُبلّغ عنها، والتحكم في التشغيل معطّل.",
  "This strip is offline. Reconnect it before sending commands.":
    "هذا المشترك غير متصل. أعد توصيله قبل إرسال الأوامر.",
  "Waiting for physical devices": "بانتظار أجهزة فعلية",
  "Connect from the desktop application": "الاتصال من تطبيق سطح المكتب",
  "Desktop application required": "يلزم تطبيق سطح المكتب",
  "Desktop connection required": "يلزم الاتصال من تطبيق سطح المكتب",
  "Device access requires the desktop application. Open MTTL Control on this computer to connect to physical strips.":
    "يتطلب الاتصال بالأجهزة تطبيق سطح المكتب. افتح تطبيق MTTL Control على هذا الحاسوب للاتصال بالمشتركات الفعلية.",
  "Open the desktop application to discover and control physical strips. Device data is unavailable in this browser.":
    "افتح تطبيق سطح المكتب لاكتشاف المشتركات الفعلية والتحكم فيها. بيانات الأجهزة غير متاحة في هذا المتصفح.",
  "Reading controller status": "جارٍ قراءة حالة وحدة التحكم",
  "Unable to read controller status": "تعذّرت قراءة حالة وحدة التحكم",
  "Loading registered strips and their latest reports.":
    "جارٍ تحميل المشتركات المسجلة وآخر بياناتها.",
  "Loading saved measurements…": "جارٍ تحميل القياسات المحفوظة…",
  "Waiting for a power strip": "بانتظار مشترك كهرباء",
  "Live measurements and outlet controls appear here after a physical MTTL-W01 strip connects to the desktop controller.":
    "تظهر القياسات المباشرة وأدوات التحكم في المقابس هنا بعد اتصال مشترك MTTL-W01 فعلي بوحدة التحكم في تطبيق سطح المكتب.",
  "Power on the strip": "وصّل المشترك بالكهرباء",
  "Enable its Wi-Fi setup mode.": "فعّل وضع تهيئة Wi-Fi على المشترك.",
  "Configure the connection": "اضبط الاتصال",
  "Set the Wi-Fi network and controller IP.":
    "اضبط شبكة Wi-Fi وعنوان IP لوحدة التحكم.",
  "Verify live status": "تحقّق من الحالة الحالية",
  "Review telemetry before switching loads.":
    "راجع القياسات قبل تشغيل الأحمال أو إيقافها.",
  "Set up a physical MTTL-W01 strip with this computer’s controller address. It will appear here when it connects.":
    "هيّئ مشترك MTTL-W01 فعليًا باستخدام عنوان وحدة التحكم على هذا الحاسوب. سيظهر هنا عند اتصاله.",
  "Status polling · 2 s / Device telemetry · 10 s":
    "تحديث الحالة كل ثانيتين / قياسات الجهاز كل 10 ثوانٍ",
  "MTTL-W01 / Physical device control": "MTTL-W01 / التحكم في الأجهزة الفعلية",
  "Remove from queue": "إزالة من قائمة التهيئة",
  "The strip will be disconnected and removed from the equipment register. Incoming connections will be ignored until you choose Add back. Saved names and event history are retained. Removing a strip does not switch off its outlets.":
    "سيُفصل المشترك ويُزال من سجل الأجهزة. ستُتجاهل اتصالاته حتى تختار «إعادة الإضافة». تبقى الأسماء وسجل الأحداث محفوظة. إزالة المشترك لا توقف مقابسه.",
  "The controller will send the documented reboot command and wait up to 60 seconds for a new connection and fresh telemetry. Reboot support and outlet behavior depend on the strip’s firmware.":
    "ستُرسل وحدة التحكم أمر إعادة التشغيل الموثّق، وتنتظر حتى 60 ثانية لاتصال جديد وقياسات حديثة. يعتمد دعم إعادة التشغيل وسلوك المقابس على البرنامج الثابت للمشترك.",
  "Incoming connections are ignored until you add a strip back. Saved names and history are retained.":
    "تُتجاهل الاتصالات الواردة حتى تعيد إضافة المشترك. تبقى الأسماء والسجل محفوظة.",
  "History remains available under Usage & history, including after clearing this list.":
    "يبقى السجل متاحًا في «الاستهلاك والسجل»، حتى بعد مسح هذه القائمة.",
  "Removed strip · archived history remains available":
    "مشترك مُزال · السجل المؤرشف متاح",
  "Clear list": "مسح القائمة",
  "Clear Removed strips list": "مسح قائمة المشتركات المُزالة",
  "Manage stored data": "إدارة البيانات المحفوظة",
  "Choose what to clear and which equipment it applies to. New device reports continue recording afterward.":
    "حدّد البيانات المراد مسحها والأجهزة المعنية. يستمر تسجيل تقارير الأجهزة الجديدة بعد المسح.",
  "Readings are stored in the local database as they arrive":
    "تُحفظ القراءات في قاعدة البيانات المحلية فور وصولها",
  "Captured outlet readings": "قراءات المقابس المسجلة",
  "Captured frames": "الإطارات المسجلة",
  "Activity events": "أحداث النشاط",
  "Counts unavailable": "الأعداد غير متاحة",
  "All local data": "جميع البيانات المحلية",
  "Clearing scope": "نطاق المسح",
  "Scope:": "النطاق:",
  "Outlet (telemetry clearing only)": "المقبس (لمسح القياسات فقط)",
  "Database reset always applies to all strips. Other actions use this selection.":
    "إعادة ضبط قاعدة البيانات تشمل جميع المشتركات دائمًا. أما الإجراءات الأخرى فتستخدم هذا التحديد.",
  "Clear activity logs": "مسح سجلات النشاط",
  "Clear telemetry history": "مسح سجل القياسات",
  "Clear all recorded data": "مسح جميع البيانات المسجلة",
  "Reset entire database": "إعادة ضبط قاعدة البيانات بالكامل",
  "Reset database": "إعادة ضبط قاعدة البيانات",
  "Clear selected data": "مسح البيانات المحددة",
  "Type RESET to confirm": "اكتب RESET للتأكيد",
  "Hide entries from the overview. Their MACs stay excluded, and names and history are retained. You can add them back by MAC.":
    "إخفاء العناصر من العرض العام. تبقى عناوين MAC مستبعدة والأسماء والسجل محفوظة. يمكنك إعادة إضافتها باستخدام عنوان MAC.",
  "Delete recorded connection, relay, and controller events. Measurement history and equipment names are retained.":
    "حذف أحداث الاتصال والمرحّلات ووحدة التحكم المسجلة. يبقى سجل القياسات وأسماء الأجهزة محفوظة.",
  "Delete saved measurements and their raw telemetry frames. Clearing one outlet also removes shared raw frames containing it. Current live readings and equipment names are retained.":
    "حذف القياسات المحفوظة وإطاراتها الخام. مسح مقبس واحد يحذف أيضًا الإطارات الخام المشتركة التي تتضمن بياناته. تبقى القراءات الحالية وأسماء الأجهزة محفوظة.",
  "Delete telemetry history and activity logs for the selected strip or all strips. Equipment names and removed-MAC exclusions are retained.":
    "حذف سجل القياسات وسجلات النشاط للمشترك المحدد أو لجميع المشتركات. تبقى أسماء الأجهزة وعناوين MAC المستبعدة محفوظة.",
  "Delete all strips, names, notes, outlet metadata, measurements, events, cached states, and removed-MAC exclusions. Active controller sessions will disconnect.":
    "حذف جميع المشتركات والأسماء والملاحظات وبيانات المقابس والقياسات والأحداث والحالات المخزنة وعناوين MAC المستبعدة. ستُفصل جلسات الاتصال النشطة بوحدة التحكم.",
  "Physical Wi-Fi settings and outlet power are unchanged. Strips configured for this controller may reconnect and register again with default names. This deletion cannot be undone.":
    "لن تتغير إعدادات Wi-Fi الفعلية أو حالة كهرباء المقابس. قد تعود المشتركات المهيأة لوحدة التحكم هذه للاتصال والتسجيل بأسماء افتراضية. لا يمكن التراجع عن هذا الحذف.",
  "These saved records will be permanently deleted. Recording resumes when new reports arrive.":
    "ستُحذف هذه السجلات المحفوظة نهائيًا. يستأنف التسجيل عند وصول تقارير جديدة.",
  "Storage controls are available in the desktop application.":
    "تتوفر أدوات إدارة التخزين في تطبيق سطح المكتب.",
  "Stored data could not be cleared.": "تعذّر مسح البيانات المحفوظة.",
  "Removed list cleared. MAC exclusions and saved history are retained.":
    "مُسحت قائمة المشتركات المُزالة. بقيت عناوين MAC المستبعدة والسجل المحفوظ.",
  "Database reset. Physical strips may reconnect with default names.":
    "أُعيد ضبط قاعدة البيانات. قد تتصل المشتركات الفعلية مجددًا بأسماء افتراضية.",
  "Selected records deleted. Incoming telemetry will continue recording.":
    "حُذفت السجلات المحددة. سيستمر تسجيل القياسات الواردة.",
  "Review electricity use, load, temperature, and protection events for each strip and outlet.":
    "راجع استهلاك الكهرباء والحمل ودرجة الحرارة وأحداث الحماية لكل مشترك ومقبس.",
  "Choose a strip to inspect": "اختر مشتركًا لعرض بياناته",
  "Select a saved strip to view its measurements.":
    "اختر مشتركًا محفوظًا لعرض قياساته.",
  "No saved strips yet. Connect a strip to begin recording. Removed strips also remain available here.":
    "لا توجد مشتركات محفوظة بعد. وصّل مشتركًا لبدء التسجيل. تبقى المشتركات المُزالة متاحة هنا أيضًا.",
  "Open the desktop application to read physical-device history. No sample data is generated.":
    "افتح تطبيق سطح المكتب لعرض سجل الأجهزة الفعلية. لا تُنشأ بيانات تجريبية.",
  "History unavailable. Correct the error and refresh.":
    "السجل غير متاح. عالج الخطأ ثم حدّث البيانات.",
  "History is associated with the physical MAC and outlet channel. Renaming keeps all measurements.":
    "يرتبط السجل بعنوان MAC الفعلي وقناة المقبس. تغيير الاسم يحافظ على جميع القياسات.",
  "Name could not be saved.": "تعذّر حفظ الاسم.",
  "Choose a valid date interval up to 31 days.":
    "اختر فترة صحيحة لا تتجاوز 31 يومًا.",
  "At least two counter readings within 30 seconds are needed to measure usage.":
    "يلزم وجود قراءتين على الأقل للعداد خلال 30 ثانية لقياس الاستهلاك.",
  "No recorded readings in this interval.":
    "لا توجد قراءات مسجلة خلال هذه الفترة.",
  "No telemetry was captured in this interval.":
    "لم تُسجّل قياسات خلال هذه الفترة.",
  "Usage comes from positive changes in the strip’s energy counters. Gaps over 30 seconds and counter resets are excluded. Missing readings stay empty.":
    "يُحسب الاستهلاك من الزيادات الموجبة في عدادات طاقة المشترك. تُستبعد الفجوات التي تزيد على 30 ثانية وحالات إعادة ضبط العداد. تظل القراءات المفقودة فارغة.",
  "Outlet usage appears after enough counter readings have been captured.":
    "يظهر استهلاك المقابس بعد تسجيل عدد كافٍ من قراءات العداد.",
  "Average of captured load samples per time bucket":
    "متوسط قراءات الحمل المسجلة لكل فترة تجميع",
  "Highest reported temperature per time bucket":
    "أعلى درجة حرارة مُبلّغ عنها لكل فترة تجميع",
  "Counter increase within captured intervals":
    "زيادة العداد خلال الفترات المسجلة",
  "Export loaded CSV": "تصدير القراءات المحمّلة بصيغة CSV",
  "Load 100 more readings": "تحميل 100 قراءة إضافية",
  "All fields": "جميع الحقول",
  "Loading records…": "جارٍ تحميل السجلات…",
  "Older records keep their original values. Fields that were not previously stored are marked “Not recorded”. Charts use the entire selected interval, including records beyond the table page.":
    "تحتفظ السجلات القديمة بقيمها الأصلية. تُعرض الحقول التي لم تكن محفوظة بعبارة «لم يُسجّل». تشمل الرسوم الفترة المحددة بالكامل، بما فيها السجلات خارج صفحة الجدول.",
  "Original telemetry reports": "تقارير القياسات الأصلية",
  "Recent events": "الأحداث الأخيرة",
  "Recorded device connections, relay changes, and controller events.":
    "اتصالات الأجهزة وتغيّرات المرحّلات وأحداث وحدة التحكم المسجلة.",
  "Latest 300 records · local controller history":
    "آخر 300 سجل · السجل المحلي لوحدة التحكم",
  "Clear / manage logs": "مسح / إدارة السجلات",
  "Filter activity events": "تصفية أحداث النشاط",
  "Filter by device, event, or detail…":
    "ابحث حسب الجهاز أو الحدث أو التفاصيل…",
  "Unable to load events:": "تعذّر تحميل الأحداث:",
  "Loading controller events…": "جارٍ تحميل أحداث وحدة التحكم…",
  "Event history is unavailable. Retry to load records.":
    "سجل الأحداث غير متاح. أعد المحاولة لتحميل السجلات.",
  "Open the desktop application to read recorded device events.":
    "افتح تطبيق سطح المكتب لعرض أحداث الأجهزة المسجلة.",
  "No events match this filter.": "لا توجد أحداث تطابق هذا البحث.",
  "No device events have been recorded yet.": "لم تُسجّل أحداث أجهزة بعد.",
  "Inspect transmitted and received frames from physical strips.":
    "افحص الإطارات المرسلة والمستلمة من المشتركات الفعلية.",
  "Protocol traffic": "حركة البروتوكول",
  "Clear display": "مسح العرض",
  "frames · newest first": "إطار · الأحدث أولًا",
  "Protocol traffic is available in the desktop application.":
    "تتوفر حركة البروتوكول في تطبيق سطح المكتب.",
  "No frames for the selected strip.": "لا توجد إطارات للمشترك المحدد.",
  "Waiting for device traffic. Incoming frames will appear here.":
    "بانتظار حركة الأجهزة. ستظهر الإطارات الواردة هنا.",
  "Command sender": "إرسال الأوامر",
  "Frames go directly to the selected connected device.":
    "تُرسل الإطارات مباشرةً إلى الجهاز المتصل المحدد.",
  "Protocol frame": "إطار البروتوكول",
  "Send frame": "إرسال الإطار",
  "Sending…": "جارٍ الإرسال…",
  "Prepare a frame:": "جهّز إطارًا:",
  "Enter one protocol frame without newline or NUL characters.":
    "أدخل إطار بروتوكول واحدًا دون أسطر جديدة أو محارف NUL.",
  "Frame queued. Inspect received frames to verify the device response.":
    "أُضيف الإطار إلى قائمة الإرسال. افحص الإطارات المستلمة للتحقق من استجابة الجهاز.",
  Incoming: "وارد",
  Outgoing: "صادر",
  IN: "وارد",
  OUT: "صادر",
  Device: "الجهاز",
  "Network host": "جهاز على الشبكة",
  "Find strips, add existing equipment, or queue several devices for setup.":
    "اكتشف المشتركات وأضف الأجهزة الموجودة أو جهّز عدة أجهزة للتهيئة.",
  "Local network": "الشبكة المحلية",
  "Detecting local network information.": "جارٍ اكتشاف معلومات الشبكة المحلية.",
  "IPv4 subnet": "الشبكة الفرعية IPv4",
  "Scan network": "فحص الشبكة",
  Scan: "فحص",
  "Scanning…": "جارٍ الفحص…",
  "Probing network addresses. Results appear after the scan finishes.":
    "جارٍ فحص عناوين الشبكة. تظهر النتائج بعد اكتمال الفحص.",
  "Local network access requires the desktop application.":
    "يتطلب الوصول إلى الشبكة المحلية تطبيق سطح المكتب.",
  "Network discovery is available in the desktop application.":
    "يتوفر اكتشاف الشبكة في تطبيق سطح المكتب.",
  "MTTL candidates only": "أجهزة MTTL المحتملة فقط",
  "Scan a subnet to find equipment. Strips in Wi-Fi setup mode are also listed under Device setup.":
    "افحص شبكة فرعية لاكتشاف الأجهزة. تظهر المشتركات في وضع تهيئة Wi-Fi أيضًا ضمن «تهيئة الأجهزة».",
  "No MTTL candidates match this filter.":
    "لا توجد أجهزة MTTL محتملة تطابق هذا التحديد.",
  "No reachable hosts found. Check the subnet, adapter, and network isolation.":
    "لم يُعثر على أجهزة يمكن الوصول إليها. تحقّق من الشبكة الفرعية ومحوّل الشبكة وعزل الشبكة.",
  "A vendor address or open port identifies a candidate, not a confirmed MTTL strip. Adding a record does not connect the device: its configured controller IP must point to this computer, and it must send valid boot information on TCP 10086.":
    "عنوان الشركة المصنّعة أو المنفذ المفتوح يشير إلى جهاز محتمل، ولا يؤكد أنه مشترك MTTL. إضافة سجل لا توصل الجهاز: يجب أن يشير عنوان وحدة التحكم المضبوط عليه إلى هذا الحاسوب وأن يرسل بيانات بدء تشغيل صحيحة عبر TCP 10086.",
  "Register a strip that is already on your network. Its identity, firmware, and live values will be verified after it connects.":
    "سجّل مشتركًا موجودًا على شبكتك. سيُتحقق من هويته وبرنامجه الثابت وقراءاته الحالية بعد اتصاله.",
  "Physical device MAC": "عنوان MAC للجهاز الفعلي",
  "Device IPv4 address": "عنوان IPv4 للجهاز",
  "12 hex digits from the strip label":
    "12 خانة بالنظام الست عشري من ملصق المشترك",
  "Enter an IPv4 network, for example 192.168.1.0/24. Discovery supports /24 networks.":
    "أدخل شبكة IPv4 مثل 192.168.1.0/24. يدعم الاكتشاف الشبكات ذات البادئة /24.",
  "Enter the physical strip’s MAC address, IPv4 address, and name.":
    "أدخل عنوان MAC وعنوان IPv4 واسم المشترك الفعلي.",
  "The strip could not be added. Check the controller notification for details.":
    "تعذّرت إضافة المشترك. راجع إشعار وحدة التحكم لمعرفة التفاصيل.",
  "254 addresses · /24 network": "254 عنوانًا · شبكة /24",
  "Setup :30300": "التهيئة :30300",
  "Channels 01–04": "القنوات 01–04",
  "Select strips, apply network settings one at a time, and verify each controller connection.":
    "حدّد المشتركات وطبّق إعدادات الشبكة على كل جهاز بالتتابع، ثم تحقّق من اتصال كل جهاز بوحدة التحكم.",
  "Device discovery and setup require the desktop application.":
    "يتطلب اكتشاف الأجهزة وتهيئتها تطبيق سطح المكتب.",
  "1. Destination network": "1. الشبكة المستهدفة",
  "Shared settings for the selected strips.":
    "إعدادات مشتركة للمشتركات المحددة.",
  "Controller IPv4 address": "عنوان IPv4 لوحدة التحكم",
  "Controller port": "منفذ وحدة التحكم",
  "Port configuration strategy": "استراتيجية إعداد المنفذ",
  "Standard (up:ip:<ip>) - Default :10086":
    "الافتراضي (up:ip:<ip>) - المنفذ 10086",
  "Combined colon (up:ip:<ip>:<port>)": "دمج بنقطتين (up:ip:<ip>:<port>)",
  "Combined comma (up:ip:<ip>,<port>)": "دمج بفاصلة (up:ip:<ip>,<port>)",
  "Separate port (up:ip:<ip> then up:port:<port>)":
    "أمر منفصل (up:ip:<ip> ثم up:port:<port>)",
  "Separate set:port (up:ip:<ip> then up:set:port:<port>)":
    "أمر تعيين منفصل (up:ip:<ip> ثم up:set:port:<port>)",
  "Use this computer’s address on the destination network. Devices connect to TCP port 10086.":
    "استخدم عنوان هذا الحاسوب على الشبكة المستهدفة. تتصل الأجهزة عبر منفذ TCP 10086.",
  "Hide setup diagnostics & probe": "إخفاء أدوات فحص الإعداد",
  "Test & Probe Setup Port / Endpoint": "فحص واختبار منفذ ونقطة الإعداد",
  "Active server listeners": "منافذ استماع الخادم النشطة",
  "Active Ports:": "المنافذ النشطة:",
  "Add Listener Port": "إضافة منفذ استماع",
  "Setup Socket Diagnostics & Command Terminal":
    "تشخيص مقبس الإعداد وطرفية الأوامر",
  "Probe which port commands the device firmware accepts while connected to its setup AP (TONLY_TAP_*).":
    "فحص أي أوامر للمنافذ تدعمها برمجية الجهاز أثناء الاتصال بنقطة إعداده (TONLY_TAP_*).",
  "Automated Port Capability Probe": "الفحص التلقائي لإمكانيات المنفذ",
  "Sends candidate port commands and queries to the setup socket and checks for acknowledgements.":
    "يرسل الأوامر والاستعلامات المرشحة لمقبس الإعداد ويتحقق من التأكيدات.",
  "Run Port Compatibility Probe": "تشغيل فحص توافق المنفذ",
  "Probing strip...": "جارٍ فحص المشترك...",
  "Endpoint Reachable": "نقطة الإعداد متاحة",
  "Endpoint Unreachable": "تعذّر الوصول لنقطة الإعداد",
  Command: "الأمر",
  Description: "الوصف",
  Status: "الحالة",
  Response: "الاستجابة",
  "HEX Dump": "ترميز HEX",
  Latency: "زمن الاستجابة",
  "Direct Setup Command Console": "طرفية أوامر الإعداد المباشرة",
  "Send arbitrary test frames directly to the strip setup socket and see the raw response bytes.":
    "إرسال إطارات اختبار مباشرة إلى مقبس إعداد المشترك وعرض البايتات المستلمة.",
  "Sending...": "جارٍ الإرسال...",
  "Send Command": "إرسال الأمر",
  "Raw Response:": "الاستجابة الأولية:",
  "Controller Server Multi-Port Listeners":
    "منافذ استماع خادم وحدة التحكم المتعددة",
  "Ensure this computer is listening on the expected port so incoming TCP connections are accepted.":
    "التأكد من استماع هذا الحاسوب على المنفذ المطلوب لقبول اتصالات TCP الواردة.",
  "Destination Wi-Fi SSID": "اسم شبكة Wi-Fi المستهدفة (SSID)",
  "Destination Wi-Fi password": "كلمة مرور شبكة Wi-Fi المستهدفة",
  "Credentials stay in memory for this setup session. Automatic setup temporarily switches this computer’s Wi-Fi.":
    "تبقى بيانات الدخول في الذاكرة لهذه الجلسة فقط. تغيّر التهيئة التلقائية اتصال Wi-Fi على هذا الحاسوب مؤقتًا.",
  "2. Select physical strips": "2. اختيار المشتركات الفعلية",
  "Scanning Wi-Fi…": "جارٍ فحص شبكات Wi-Fi…",
  "Add strips from Wi-Fi discovery, enter a setup endpoint, or select devices in Network discovery.":
    "أضف مشتركات من شبكات Wi-Fi المكتشفة، أو أدخل عنوان التهيئة ومنفذها، أو حدّد أجهزة من «اكتشاف أجهزة الشبكة».",
  "Add access point": "إضافة نقطة وصول",
  "Add reachable setup endpoint": "إضافة عنوان تهيئة يمكن الوصول إليه",
  "No strip access points found. Enable setup mode on each strip and scan again, or enter a setup endpoint below.":
    "لم يُعثر على نقاط وصول للمشتركات. فعّل وضع التهيئة على كل مشترك وأعد الفحص، أو أدخل عنوان التهيئة ومنفذها أدناه.",
  "Enter an access point or setup endpoint":
    "أدخل نقطة وصول أو عنوان تهيئة ومنفذًا",
  "Setup SSID (automatic Wi-Fi switching)":
    "اسم شبكة التهيئة (تبديل Wi-Fi تلقائيًا)",
  "Setup password (blank uses LGU_ suffix)":
    "كلمة مرور التهيئة (اتركها فارغة لاستخدام لاحقة LGU_)",
  "Strip setup IPv4": "عنوان IPv4 لتهيئة المشترك",
  "Setup port": "منفذ التهيئة",
  "Default 192.168.1.1:30300. Change these before adding a strip if its firmware uses another endpoint.":
    "القيمة الافتراضية 192.168.1.1:30300. غيّر العنوان والمنفذ قبل إضافة المشترك إذا كان برنامجه الثابت يستخدم قيمًا أخرى.",
  "Expected runtime MAC (optional)":
    "عنوان MAC المتوقع أثناء التشغيل (اختياري)",
  "Without a MAC, you must confirm the newly connected strip’s identity after setup.":
    "إذا لم تُدخل عنوان MAC، يجب تأكيد هوية المشترك الذي اتصل حديثًا بعد التهيئة.",
  "For a reachable endpoint, connect this computer to the strip’s setup network first. Wi-Fi is not switched automatically.":
    "لتهيئة جهاز عبر عنوان يمكن الوصول إليه، وصّل الحاسوب بشبكة تهيئة المشترك أولًا. لن يُبدّل Wi-Fi تلقائيًا.",
  "3. Setup queue": "3. قائمة التهيئة",
  "The queue pauses on a failure or unconfirmed identity. Saved settings are not rolled back. Recheck connectivity before repeating setup.":
    "تتوقف القائمة مؤقتًا عند حدوث فشل أو عدم تأكيد الهوية. لا تُلغى الإعدادات المحفوظة. تحقّق من الاتصال قبل إعادة التهيئة.",
  "Stop after current setup": "التوقف بعد الجهاز الحالي",
  "Setup is in progress. A Wi-Fi switch already started will finish restoring the network before stopping.":
    "التهيئة قيد التنفيذ. إذا بدأ تبديل Wi-Fi، ستكتمل استعادة الشبكة قبل التوقف.",
  "Choose the physical strip…": "اختر المشترك الفعلي…",
  "Newly connected strip": "مشترك متصل حديثًا",
  "Confirm identity": "تأكيد الهوية",
  "Choose the physical strip you just configured. A setup SSID or IP alone does not prove its runtime identity.":
    "اختر المشترك الفعلي الذي هيّأته للتو. اسم شبكة التهيئة أو عنوان IP وحده لا يثبت هوية الجهاز أثناء التشغيل.",
  "Check connection again": "التحقق من الاتصال مجددًا",
  "Retry setup": "إعادة التهيئة",
  "Protocol steps (": "خطوات البروتوكول (",
  "View strip": "عرض المشترك",
  "Ready for setup": "جاهز للتهيئة",
  "Paused by operator": "أوقفه المستخدم مؤقتًا",
  "Start the controller listener before provisioning devices.":
    "شغّل خدمة استقبال وحدة التحكم قبل تهيئة الأجهزة.",
  "Wait for pending strip commands to finish before starting device setup.":
    "انتظر اكتمال أوامر المشتركات المعلقة قبل بدء تهيئة الأجهزة.",
  "Device setup is running. Stop the queue and wait for the current device to finish before leaving.":
    "تهيئة الأجهزة قيد التنفيذ. أوقف القائمة وانتظر اكتمال الجهاز الحالي قبل مغادرة الصفحة.",
  "Two queue entries have the same MAC. Remove the duplicate before continuing.":
    "يوجد جهازان في القائمة بعنوان MAC نفسه. أزل التكرار قبل المتابعة.",
  "Enter this computer’s reachable controller IPv4 address and the destination Wi-Fi. Colons, newlines, and NUL characters are unsupported in device Wi-Fi credentials.":
    "أدخل عنوان IPv4 لوحدة التحكم على هذا الحاسوب وبيانات شبكة Wi-Fi المستهدفة. لا تدعم بيانات Wi-Fi النقطتين الرأسيتين أو الأسطر الجديدة أو محارف NUL.",
  "Enter the strip’s 12-digit MAC address, or leave it blank to confirm identity after setup.":
    "أدخل عنوان MAC للمشترك المكوّن من 12 خانة، أو اتركه فارغًا لتأكيد الهوية بعد التهيئة.",
  "Enter a valid runtime MAC, or clear the field and confirm identity after setup.":
    "أدخل عنوان MAC صحيحًا أثناء التشغيل، أو امسح الحقل لتأكيد الهوية بعد التهيئة.",
  "Enter a TONLY_TAP_… or ONLY_TAP_… setup SSID.":
    "أدخل اسم شبكة تهيئة يبدأ بـ TONLY_TAP_ أو ONLY_TAP_.",
  "Enter a reachable strip IPv4 address and port 1–65535.":
    "أدخل عنوان IPv4 يمكن الوصول إليه للمشترك ومنفذًا من 1 إلى 65535.",
  "Applying settings at the specified setup endpoint…":
    "جارٍ تطبيق الإعدادات على عنوان التهيئة المحدد…",
  "Connecting to the selected access point, applying settings, then restoring this computer’s network…":
    "جارٍ الاتصال بنقطة الوصول المحددة وتطبيق الإعدادات ثم استعادة شبكة هذا الحاسوب…",
  "Waiting for a new controller connection and all four telemetry records…":
    "بانتظار اتصال جديد بوحدة التحكم وقياسات المقابس الأربعة…",
  "New connection and fresh four-channel telemetry received.":
    "وصل اتصال جديد وقياسات حديثة للقنوات الأربع.",
  "Identity confirmed by operator; new connection and fresh telemetry verified.":
    "أكّد المستخدم الهوية، وتم التحقق من الاتصال الجديد والقياسات الحديثة.",
  "That connection is no longer fresh or is already assigned. Check the connection again.":
    "لم يعد الاتصال حديثًا أو تم ربطه بجهاز آخر. تحقّق من الاتصال مجددًا.",
  "Verification paused. Settings already sent are preserved; check the connection again.":
    "توقف التحقق مؤقتًا. بقيت الإعدادات المرسلة محفوظة؛ تحقّق من الاتصال مجددًا.",
  "Settings were sent. Restore the destination network, then check the connection before retrying setup.":
    "أُرسلت الإعدادات. أعد الاتصال بالشبكة المستهدفة، ثم تحقّق من الاتصال قبل إعادة التهيئة.",
  "Correct the reported issue, then retry setup.":
    "عالج المشكلة المُبلّغ عنها ثم أعد التهيئة.",
  "Already connected with fresh telemetry. No settings sent.":
    "الجهاز متصل بالفعل وقياساته حديثة. لم تُرسل إعدادات.",
  "Adding strip": "جارٍ إضافة المشترك",
  "Adding strip back": "جارٍ إعادة إضافة المشترك",
  "Removing strip": "جارٍ إزالة المشترك",
  "Rebooting strip": "جارٍ إعادة تشغيل المشترك",
  "Refreshing telemetry": "جارٍ تحديث القياسات",
  "Switching all strips off": "جارٍ إيقاف جميع المشتركات",
  "Clearing stored data": "جارٍ مسح البيانات المحفوظة",
  "Strip added back. Waiting for its physical connection.":
    "أُعيدت إضافة المشترك. بانتظار اتصاله الفعلي.",
  "Strip registered. It will become online after connecting to this controller.":
    "سُجّل المشترك. ستصبح حالته «متصل» بعد اتصاله بوحدة التحكم هذه.",
  "Strip removed. Saved names and history are retained; reconnects are ignored until you add it back.":
    "أُزيل المشترك. بقيت الأسماء والسجل محفوظة؛ ستُتجاهل محاولات اتصاله حتى تعيد إضافته.",
  "Strip reconnected after reboot and fresh telemetry was received.":
    "اتصل المشترك مجددًا بعد إعادة تشغيله ووصلت قياسات حديثة.",
  "Reboot was queued but the strip did not reconnect with fresh telemetry within 60 seconds. Runtime reboot support may vary by firmware. Check its power and network connection before retrying.":
    "أُرسل أمر إعادة التشغيل، لكن المشترك لم يعد للاتصال بقياسات حديثة خلال 60 ثانية. قد يختلف دعم إعادة التشغيل حسب البرنامج الثابت. تحقّق من الكهرباء واتصال الشبكة قبل إعادة المحاولة.",
  "The device did not confirm the requested state within 12 seconds. The display shows its last reported state; check the connection before retrying.":
    "لم يؤكد الجهاز الحالة المطلوبة خلال 12 ثانية. تُعرض آخر حالة مُبلّغ عنها؛ تحقّق من الاتصال قبل إعادة المحاولة.",
  ". Waiting for device confirmation…": ". بانتظار تأكيد الجهاز…",
  "(last reported)": "(آخر قيمة مُبلّغ عنها)",
  "· last reported": "· آخر قيمة مُبلّغ عنها",
  "· Offline": "· غير متصل",
  "· Event": "· الحدث",
  "· removed": "· مُزال",
  "· newest first · local time": "· الأحدث أولًا · التوقيت المحلي",
  "outlet readings": "قراءة للمقابس",
  samples: "قراءة",
  loaded: "محمّل",
  events: "حدث",
  connected: "متصل",
  "currently connected": "متصل حاليًا",
  registered: "مسجّل",
  interfaces: "واجهات شبكة",
  "setup endpoints selected": "عنوان تهيئة محدد",
  "verified ·": "تم التحقق ·",
  "waiting ·": "بانتظار الاتصال ·",
  "by SSID": "حسب اسم الشبكة",
  s: "ثانية",
  boot: "بدء التشغيل",
  "relay changed": "تغيّر المرحّل",
  disconnected: "انقطع الاتصال",
  "device added": "أُضيف جهاز",
  "device restored": "أُعيدت إضافة جهاز",
  "device removed": "أُزيل جهاز",
  "reboot requested": "طلب إعادة التشغيل",
  "storage error": "خطأ في التخزين",
  "identity timeout": "انتهت مهلة التحقق من الهوية",
  "Connection Failed": "فشل الاتصال",
  "Connection Timeout": "انتهت مهلة الاتصال",
  "Connection timed out": "انتهت مهلة الاتصال",
  "Send Controller IP": "إرسال عنوان وحدة التحكم",
  "Controller IP not confirmed": "لم يُؤكّد عنوان وحدة التحكم",
  "Controller IP configured": "تم ضبط عنوان وحدة التحكم",
  "Send Wi-Fi Credentials": "إرسال بيانات Wi-Fi",
  "Wi-Fi settings not confirmed": "لم تُؤكّد إعدادات Wi-Fi",
  "Wi-Fi settings configured": "تم ضبط إعدادات Wi-Fi",
  "Reboot command failed": "فشل أمر إعادة التشغيل",
  "Reboot Command Dispatched": "أُرسل أمر إعادة التشغيل",
  "Setup Wi-Fi connection failed": "فشل الاتصال بشبكة التهيئة",
  "Computer Wi-Fi restored": "استُعيد اتصال Wi-Fi للحاسوب",
  "Computer Wi-Fi restoration failed": "فشلت استعادة اتصال Wi-Fi للحاسوب",
  "Invalid strip IPv4 address or setup port":
    "عنوان IPv4 للمشترك أو منفذ التهيئة غير صحيح",
  "Invalid setup IPv4 address or port": "عنوان IPv4 للتهيئة أو المنفذ غير صحيح",
  "A strip setup SSID and password are required":
    "يلزم اسم شبكة تهيئة المشترك وكلمة مرورها",
  "Invalid setup access-point BSSID": "عنوان BSSID لنقطة وصول التهيئة غير صحيح",
  "Automatic setup requires Linux NetworkManager. Join the strip Wi-Fi and use manual setup on this platform.":
    "تتطلب التهيئة التلقائية NetworkManager على Linux. اتصل بشبكة Wi-Fi للمشترك واستخدم التهيئة اليدوية على هذا النظام.",
  "Unable to connect to the selected strip access point":
    "تعذّر الاتصال بنقطة وصول المشترك المحددة",
  "Settings acknowledged, but the reboot command failed. Check the strip before retrying.":
    "أكّد الجهاز الإعدادات، لكن أمر إعادة التشغيل فشل. تحقّق من المشترك قبل إعادة المحاولة.",
  "Sent up:reboot:0. Strip will now connect to Wi-Fi and reach out to your controller on TCP port 10086.":
    "أُرسل الأمر up:reboot:0. سيتصل المشترك بشبكة Wi-Fi ثم بوحدة التحكم عبر منفذ TCP 10086.",
  "Settings acknowledged and reboot command sent. Awaiting runtime connection.":
    "أكّد الجهاز الإعدادات وأُرسل أمر إعادة التشغيل. بانتظار اتصال الجهاز أثناء التشغيل.",
  "Computer Wi-Fi could not be restored. The setup queue has paused; reconnect manually before checking the strip.":
    "تعذّرت استعادة Wi-Fi للحاسوب. توقفت قائمة التهيئة مؤقتًا؛ أعد الاتصال يدويًا قبل التحقق من المشترك.",
  "Settings acknowledged and computer Wi-Fi restored. Waiting for the strip’s runtime connection.":
    "أكّد الجهاز الإعدادات واستُعيد Wi-Fi للحاسوب. بانتظار اتصال المشترك أثناء التشغيل.",
  "Invalid controller IPv4 address": "عنوان IPv4 لوحدة التحكم غير صحيح",
  "Use a reachable controller IPv4 address":
    "استخدم عنوان IPv4 يمكن الوصول إليه لوحدة التحكم",
  "Wi-Fi SSID is required": "يلزم اسم شبكة Wi-Fi",
  "Wi-Fi credentials cannot contain colons, newlines, or NUL characters":
    "لا يمكن أن تتضمن بيانات Wi-Fi نقطتين رأسيتين أو أسطرًا جديدة أو محارف NUL",
  "Wi-Fi discovery failed. Check NetworkManager and the wireless adapter.":
    "فشل اكتشاف Wi-Fi. تحقّق من NetworkManager ومحوّل الشبكة اللاسلكية.",
  "Windows denied Wi-Fi discovery. Enable Location services and app location access in Settings > Privacy & security > Location, then scan again.":
    "رفض Windows اكتشاف Wi-Fi. فعّل خدمات الموقع ووصول التطبيقات إلى الموقع من الإعدادات > الخصوصية والأمان > الموقع، ثم أعد الفحص.",
  "Wi-Fi discovery failed. Start the Windows WLAN AutoConfig service, then scan again.":
    "فشل اكتشاف Wi-Fi. شغّل خدمة WLAN AutoConfig في Windows، ثم أعد الفحص.",
  "Wi-Fi is turned off. Enable the wireless adapter and turn off airplane mode, then scan again.":
    "Wi-Fi متوقف. فعّل محوّل الشبكة اللاسلكية وأوقف وضع الطيران، ثم أعد الفحص.",
  "No Windows Wi-Fi adapter found. Enable or connect a wireless adapter, then scan again.":
    "لم يُعثر على محوّل Wi-Fi في Windows. فعّل أو وصّل محوّل شبكة لاسلكية، ثم أعد الفحص.",
  "Windows could not complete the Wi-Fi scan. Check the wireless adapter and scan again.":
    "تعذّر على Windows إكمال فحص Wi-Fi. تحقّق من محوّل الشبكة اللاسلكية وأعد الفحص.",
  "Device command queue timed out": "انتهت مهلة قائمة أوامر الجهاز",
  "Channel must be between 1 and 4": "يجب أن تكون القناة من 1 إلى 4",
  "No strips are connected": "لا توجد مشتركات متصلة",
  "Strip is offline; reboot is unavailable":
    "المشترك غير متصل؛ إعادة التشغيل غير متاحة",
  "Enter a valid 12-digit device MAC address":
    "أدخل عنوان MAC صحيحًا للجهاز من 12 خانة",
  "Enter a valid device IPv4 address": "أدخل عنوان IPv4 صحيحًا للجهاز",
  "Enter a reachable device IPv4 address":
    "أدخل عنوان IPv4 يمكن الوصول إليه للجهاز",
  "Enter a strip name of up to 160 characters":
    "أدخل اسمًا للمشترك لا يتجاوز 160 حرفًا",
  "Enter a strip name of 1–80 characters and notes up to 500 characters":
    "أدخل اسمًا للمشترك من 1 إلى 80 حرفًا وملاحظات لا تتجاوز 500 حرف",
  "Select outlet 1–4 and enter a name of 1–80 characters":
    "اختر مقبسًا من 1 إلى 4 وأدخل اسمًا من 1 إلى 80 حرفًا",
  "Another device setup is running. Wait for it to finish.":
    "توجد تهيئة أخرى قيد التنفيذ. انتظر اكتمالها.",
  "System Wi-Fi connection is not supported on this platform":
    "لا يدعم هذا النظام ضبط اتصال Wi-Fi تلقائيًا",
  "Select a valid strip MAC": "اختر عنوان MAC صحيحًا للمشترك",
  "Select an outlet from 1 to 4": "اختر مقبسًا من 1 إلى 4",
  "Choose a history interval between 1 second and 31 days":
    "اختر فترة للسجل من ثانية واحدة إلى 31 يومًا",
  "Invalid strip MAC": "عنوان MAC للمشترك غير صحيح",
  "Outlet clearing requires one strip and telemetry history":
    "لمسح بيانات مقبس، حدّد مشتركًا واحدًا وسجل القياسات",
  "Database reset applies to all strips":
    "إعادة ضبط قاعدة البيانات تشمل جميع المشتركات",
  "Wait for device setup to finish before clearing data":
    "انتظر اكتمال تهيئة الأجهزة قبل مسح البيانات",
  "Removed from controller; settings and history retained":
    "أُزيل من وحدة التحكم؛ بقيت الإعدادات والسجل محفوظة",
  "Reboot queued; awaiting a new runtime connection":
    "أُرسل أمر إعادة التشغيل؛ بانتظار اتصال جديد أثناء التشغيل",
  "Added back; awaiting physical strip connection":
    "أُعيدت إضافته؛ بانتظار اتصال المشترك الفعلي",
  "Registered manually; awaiting a physical runtime connection":
    "سُجّل يدويًا؛ بانتظار اتصال الجهاز الفعلي أثناء التشغيل",
  "Device boot": "بدء تشغيل الجهاز",
  "Set up": "تهيئة",
  "Normal / OK": "طبيعي / سليم",
  "Overcurrent / Overload Trip (>16A)":
    "فصل وقائي بسبب تجاوز التيار أو الحمل (أكثر من 16 A)",
  "Overheat / Thermal Cutoff Trip": "فصل وقائي بسبب ارتفاع الحرارة",
  "Overvoltage / Transient Surge": "ارتفاع الجهد / موجة جهد عابرة",
  "Manual Switch / Pushbutton Toggled": "تبديل باستخدام الزر اليدوي",
  "Communication / Internal MCU Fault": "خلل في الاتصال / وحدة التحكم الداخلية",
  "Custom Event": "حدث غير معروف",
  "Enter a valid IPv4 subnet": "أدخل شبكة فرعية IPv4 صحيحة",
  "Discovery supports /24 networks only":
    "يدعم الاكتشاف الشبكات ذات البادئة /24 فقط",
  "AC line voltage": "جهد التيار المتردد (AC)",
  "Wi-Fi signal": "إشارة Wi-Fi",
  "Live measurement": "قياس مباشر",
  "Awaiting report": "بانتظار التقرير",
  "Calculated current": "التيار المحسوب",
  "3,520 W / 16 A": "3,520 W / 16 A",
  "Command presets & reference": "الأوامر المجهزة ودليل البروتوكول",
  "All commands": "جميع الأوامر",
  "Master Switch (Ch 0)": "المفتاح الرئيسي (القناة 0)",
  "Outlets (1–4)": "المقابس الفردية (1-4)",
  "Send now": "إرسال الآن",
  "Selected: ": "المحدد: ",
  "Expected response: ": "الاستجابة المتوقعة: ",

  // --- Device Setup (One-by-One Pairing) ---
  "ONE-BY-ONE PAIRING": "تهيئة الأجهزة فرديًا",
  "Connect and pair smart power strips one by one to your Wi-Fi network and controller.":
    "قم بتهيئة وإقران المشتركات الذكية واحدًا تلو الآخر بشبكة Wi-Fi ووحدة التحكم.",
  "1. Target network & controller": "1. الشبكة المستهدفة ووحدة التحكم",
  "Credentials that will be sent to the power strip so it connects to your system.":
    "بيانات الاعتماد التي سيتم إرسالها إلى المشترك ليتصل بنظامك.",
  "Hide advanced": "إخفاء الخيارات المتقدمة",
  "Advanced options": "خيارات متقدمة",
  "Controller local IPv4": "عنوان IPv4 المحلي لوحدة التحكم",
  "● This computer's address on your network":
    "● عنوان هذا الحاسوب على شبكتك المحلية",
  "Port command strategy": "طريقة إرسال المنفذ",
  "Strip default setup endpoint": "عنوان التهيئة الافتراضي للمشترك",
  "Pairing complete!": "اكتمل الاقتران بنجاح!",
  "Pairing needs attention": "الاقتران يتطلب التدخل",
  "Paired & Verified": "مقترن ومؤكد",
  "Verifying Link": "جارٍ التحقق من الاتصال",
  Configuring: "جارٍ الضبط",
  "Wi-Fi AP:": "نقطة وصول Wi-Fi:",
  "Endpoint:": "نقطة النهاية:",
  "1. Connect Strip": "1. الاتصال بالمشترك",
  "2. Send Config": "2. إرسال الإعدادات",
  "3. Restore Wi-Fi": "3. استعادة Wi-Fi",
  "4. Verify Link": "4. تأكيد الاتصال",
  "Select the physical strip:": "حدد المشترك الفعلي:",
  "Multiple new devices connected to the controller. Choose which one matches this strip:":
    "اتصلت أجهزة جديدة متعددة بوحدة التحكم. اختر الجهاز المطابق لهذا المشترك:",
  "Confirm & Finish Pairing": "تأكيد وإتمام الاقتران",
  "Open strip in dashboard": "فتح المشترك في لوحة التحكم",
  "Pair another device": "إقران جهاز آخر",
  "Retry pairing": "إعادة محاولة الاقتران",
  "Back to available devices": "العودة إلى الأجهزة المتاحة",
  "Cancel pairing": "إلغاء الاقتران",
  "2. Select strip to pair": "2. اختيار المشترك للإقران",
  "Scanning for nearby setup access points…":
    "جارٍ البحث عن نقاط وصول التهيئة القريبة…",
  "Scan Wi-Fi": "فحص Wi-Fi",
  "● Ready for one-click setup": "● جاهز للإقران بنقرة واحدة",
  "Ready for one-click setup": "جاهز للإقران بنقرة واحدة",
  "Pair this strip": "إقران هذا المشترك",
  "No strips detected in setup mode":
    "لم يتم العثور على مشتركات في وضع التهيئة",
  "Searching for smart strips…": "جارٍ البحث عن المشتركات الذكية…",
  "Hold the power button on the physical strip for 5 seconds until the LED blinks (TONLY_TAP_…), then click Scan Wi-Fi.":
    "اضغط مطولاً على زر التشغيل في المشترك لمدة 5 ثوانٍ حتى يومض المؤشر (TONLY_TAP_...)، ثم اضغط فحص Wi-Fi.",
  "▲ Hide manual IP setup": "▲ إخفاء الإعداد اليدوي",
  "▼ Can't find strip? Enter IP or custom SSID manually":
    "▼ لم تجد المشترك؟ أدخل عنوان IP أو اسم الشبكة يدويًا",
  "Setup AP Wi-Fi (TONLY_TAP_…)": "نقطة وصول التهيئة (TONLY_TAP_…)",
  "Reachable endpoint (IP & Port)": "عنوان متاح مباشرة (IP والمنفذ)",
  "Setup SSID": "اسم شبكة التهيئة (SSID)",
  "Setup password (optional)": "كلمة مرور التهيئة (اختياري)",
  "Pair manual device": "إقران الجهاز اليدوي",
  "Advanced diagnostics & socket tools": "أدوات التشخيص المتقدمة والمنافذ",
  "Firmware capability tests, direct port terminal, and multi-port server listener management.":
    "اختبارات قدرات البرنامج الثابت ووحدة أوامر المنفذ وإدارة منافذ الاستقبال المتعددة.",
  "Hide tools": "إخفاء الأدوات",
  "Show tools": "عرض الأدوات",
  "Controller Server Listeners": "منافذ استقبال خادم وحدة التحكم",
  "Add Listener": "إضافة منفذ استقبال",
  "Send Raw Setup Command to Strip": "إرسال أمر تهيئة خام إلى المشترك",
  "Target:": "الهدف:",
  Send: "إرسال",
  "Run probe": "تشغيل الفحص",
  "Please wait for ongoing plug commands to finish.":
    "يرجى الانتظار حتى تنتهي أوامر المشترك الحالية.",
  "Please enter a valid controller IPv4 address for this computer.":
    "يرجى إدخال عنوان IPv4 محلي صحيح لوحدة التحكم على هذا الحاسوب.",
  "Please enter your home Wi-Fi SSID and password to give to the strip.":
    "يرجى إدخال اسم شبكة Wi-Fi وكلمة المرور لإرسالها إلى المشترك.",
  "Controller TCP listener is not running. Please start the service.":
    "خدمة استقبال TCP لوحدة التحكم لا تعمل. يرجى تشغيل الخدمة.",
  "Device paired successfully and online!":
    "تم إقران الجهاز بنجاح وهو الآن متصل بالإنترنت!",
  "Device identity confirmed and paired!":
    "تم تأكيد هوية الجهاز واكتمال الاقتران!",
  "Applying controller address and destination Wi-Fi credentials…":
    "جارٍ إرسال عنوان وحدة التحكم وبيانات شبكة Wi-Fi…",
  "Strip is rebooting and joining Wi-Fi. Waiting for incoming controller link…":
    "يعيد المشترك التشغيل الآن ويتصل بـ Wi-Fi. بانتظار اتصاله بوحدة التحكم…",
  "Timed out waiting for strip connection (60s). Check strip power, Wi-Fi signal, and controller port 10086.":
    "انتهت المهلة بانتظار اتصال المشترك (60 ثانية). تحقق من توصيل الكهرباء وقوة إشارة Wi-Fi ومنفذ وحدة التحكم 10086.",
  "Multiple new strips detected. Please select this physical strip.":
    "تم اكتشاف أكثر من مشترك جديد. يرجى اختيار المشترك الفعلي المطابق.",

  // --- Power Analyzer ---
  "Inspect electrical behavior, analyze energy consumption, and compare outlets.":
    "فحص السلوك الكهربائي وتحليل استهلاك الطاقة ومقارنة المقابس.",
  "Export CSV": "تصدير CSV",
  "Outlets to analyze": "المقابس المطلوب تحليلها",
  "Inspecting single outlet": "فحص مقبس واحد",
  "Compare with another outlet": "مقارنة مع مقبس آخر",
  "Selected Outlet": "المقبس المحدد",
  "Remove from comparison": "إزالة من المقارنة",
  "Interval:": "الفترة:",
  "1 Hour": "ساعة واحدة",
  "24 Hours": "24 ساعة",
  "7 Days": "7 أيام",
  "30 Days": "30 يومًا",
  Custom: "مخصص",
  "Tariff / kWh:": "التعريفة / ك.و.س:",
  Optional: "اختياري",
  "Auto-refresh": "تحديث تلقائي",
  every: "كل",
  sec: "ثانية",
  "Current Load": "الحمل الحالي",
  "● Relay Active": "● المقبس يعمل",
  "○ Relay Off": "○ المقبس متوقف",
  "Total Energy": "إجمالي الطاقة",
  "Across selected interval": "خلال الفترة المحددة",
  "Peak Load": "أقصى حمل",
  "Active Time": "وقت التشغيل",
  "Peak Temp": "أعلى حرارة",
  "Thermal reading": "قراءة حرارية",
  "Matched power difference (Outlet 1 minus Outlet 2):":
    "فرق القدرة المتطابق (المقبس 1 ناقص المقبس 2):",
  "Energy & Load Summary": "ملخص الطاقة والأحمال",
  "Key statistics calculated from captured telemetry in the selected interval.":
    "إحصاءات رئيسية محسوبة من القياسات المسجلة في الفترة المحددة.",
  "Total observed energy": "إجمالي الطاقة المرصودة",
  "Average active load": "متوسط الحمل النشط",
  "Peak demand": "أقصى استهلاك",
  "Operating time (Relay ON)": "مدة التشغيل (المرحّل يعمل)",
  "Standby time (≤ 3 W)": "مدة الاستعداد (≤ 3 واط)",
  "Estimated cost": "التكلفة التقديرية",
  "Select an outlet with stored telemetry to analyze power data.":
    "اختر مقبسًا يحتوي على قياسات مسجلة لتحليل البيانات.",
  "▲ Hide technical sampling diagnostics": "▲ إخفاء تشخيصات أخذ العينات الفنية",
  "▼ Show technical sampling diagnostics (packet counts, gaps, std dev)":
    "▼ عرض تشخيصات أخذ العينات الفنية (حزم البيانات، الفجوات، الانحراف المعياري)",
  "Diagnostic parameter": "معامل التشخيص",
  "Power standard deviation": "الانحراف المعياري للقدرة",
  "Interval sample coverage": "نسبة تغطية العينات للفترة",
  "Captured telemetry packets": "حزم القياسات المسجلة",
  "Captured relay switches": "تبديلات المقبس المسجلة",
  "Outlet behavior alerts & automatic shutoff":
    "تنبيهات سلوك المقابس والإيقاف التلقائي",
  "Watch sustained power or temperature conditions and record alerts or auto-shutoff.":
    "مراقبة استمرار تجاوز القدرة أو الحرارة وتسجيل تنبيهات أو تنفيذ إيقاف تلقائي.",
  "▲ Hide rules": "▲ إخفاء القواعد",
  "▼ Manage rules": "▼ إدارة القواعد",

  // Power Analyzer & Metrics
  Average: "المتوسط",
  "Average:": "المتوسط:",
  Standby: "الاستعداد",
  "Standby:": "الاستعداد:",
  W: "واط",
  Watts: "واط",
  "High-precision power telemetry aligned on identical time axes":
    "قياسات دقيقة للقدرة محاذاة على نفس المحور الزمني",
  "Power comparison": "مقارنة القدرة",
  "Power comparison chart": "مخطط مقارنة القدرة",
  "Select outlets with saved readings to view power telemetry curves.":
    "اختر مقابس تحتوي على قراءات مسجلة لعرض منحنيات القدرة.",
  "Est. cost": "التكلفة التقديرية",
  "Est. cost:": "التكلفة التقديرية:",

  // Protocol Console & Presets
  "Telemetry & Diagnostics": "القياسات والتشخيص",
  "System & Maintenance": "النظام والصيانة",
  telemetry: "قياسات",
  master: "رئيسي",
  outlets: "مقابس",
  system: "نظام",
  "Full Telemetry": "كامل القياسات",
  "AC Line Voltage": "جهد خط التيار المتردد",
  "Wi-Fi Signal (RSSI)": "إشارة Wi-Fi (RSSI)",
  "Master: All Outlets ON": "الرئيسي: تشغيل جميع المقابس",
  "Master: All Outlets OFF": "الرئيسي: إيقاف جميع المقابس",
  "Outlet 1: ON": "المقبس 1: تشغيل",
  "Outlet 1: OFF": "المقبس 1: إيقاف",
  "Outlet 2: ON": "المقبس 2: تشغيل",
  "Outlet 2: OFF": "المقبس 2: إيقاف",
  "Outlet 3: ON": "المقبس 3: تشغيل",
  "Outlet 3: OFF": "المقبس 3: إيقاف",
  "Outlet 4: ON": "المقبس 4: تشغيل",
  "Outlet 4: OFF": "المقبس 4: إيقاف",
  "Reboot Strip MCU": "إعادة تشغيل معالج المشترك",
  "Boot Info (Device Announcement)": "معلومات الإقلاع (إعلان الجهاز)",
  "Query Device IP (Unsupported by MCU)":
    "استعلام IP الجهاز (غير مدعوم بالمعالج)",
  "Query Firmware Version (Unsupported by MCU)":
    "استعلام إصدار البرنامج (غير مدعوم بالمعالج)",
  "Query Hardware MAC (Unsupported by MCU)":
    "استعلام MAC العتادي (غير مدعوم بالمعالج)",
  "Queries live telemetry for all 4 outlets (power, energy, relay states, temperatures, flags).":
    "استعلام القياسات المباشرة للمقابس الـ 4 (القدرة، الطاقة، حالة المقابس، الحرارة، التنبيهات).",
  "Queries live AC line voltage from strip hardware in millivolts.":
    "استعلام جهد خط التيار المتردد المباشر من عتاد المشترك بالميلي فولت.",
  "Queries strip Wi-Fi connection signal strength in dBm.":
    "استعلام قوة إشارة اتصال Wi-Fi للمشترك بوحدة dBm.",
  "Sends master power command to switch all 4 outlets ON simultaneously.":
    "إرسال أمر الطاقة الرئيسي لتشغيل جميع المقابس الأربعة معًا.",
  "Sends master power command to switch all 4 outlets OFF simultaneously.":
    "إرسال أمر الطاقة الرئيسي لإيقاف جميع المقابس الأربعة معًا.",
  "Energizes Outlet 1 relay.": "توصيل مرحّل المقبس 1.",
  "De-energizes Outlet 1 relay.": "فصل مرحّل المقبس 1.",
  "Energizes Outlet 2 relay.": "توصيل مرحّل المقبس 2.",
  "De-energizes Outlet 2 relay.": "فصل مرحّل المقبس 2.",
  "Energizes Outlet 3 relay.": "توصيل مرحّل المقبس 3.",
  "De-energizes Outlet 3 relay.": "فصل مرحّل المقبس 3.",
  "Energizes Outlet 4 relay.": "توصيل مرحّل المقبس 4.",
  "De-energizes Outlet 4 relay.": "فصل مرحّل المقبس 4.",
  "Restarts strip microcontroller and Wi-Fi stack. The strip reconnects and sends its bootinfo handshake.":
    "إعادة تشغيل معالج المشترك ووحدة Wi-Fi. يعيد المشترك الاتصال ويرسل مصافحة bootinfo.",
  "The strip transmits up:bootinfo automatically upon connection/reboot. Sending it manually as a query to the strip is not implemented by stock firmware (yields empty response). Use 'Reboot Strip MCU' to trigger a new boot handshake.":
    "يرسل المشترك up:bootinfo تلقائيًا عند الاتصال أو إعادة التشغيل. الاستعلام اليدوي غير مدعوم في البرنامج المصنعي. استخدم 'إعادة تشغيل معالج المشترك' لتشغيل مصافحة إقلاع جديدة.",
  "The MCU runtime firmware does not implement up:query:ip (returns empty CRLF). The strip IPv4 address is obtained directly from its active TCP socket.":
    "لا يدعم برنامج المشترك المصنعي up:query:ip (يعيد CRLF فارغًا). يتم الحصول على عنوان IPv4 من مقبس TCP المباشر.",
  "Firmware version is announced in the initial boot frame. Stock MCU runtime returns empty CRLF.":
    "يُعلن عن إصدار البرنامج الثابت في إطار الإقلاع المبدئي. يعيد برنامج المعالج CRLF فارغًا.",
  "Hardware MAC is announced in the initial boot frame. Stock MCU runtime returns empty CRLF.":
    "يُعلن عن عنوان MAC في إطار الإقلاع المبدئي. يعيد برنامج المعالج CRLF فارغًا.",
  "Strip drops connection, restarts, and sends up:bootinfo:...":
    "يقطع المشترك الاتصال، ويعيد التشغيل، ثم يرسل up:bootinfo:...",
  "Sent by strip upon connect: up:bootinfo:<model>;<mac1>;<mac2>;<fw>;connect":
    "مرسل من المشترك عند الاتصال: up:bootinfo:<model>;<mac1>;<mac2>;<fw>;connect",
  "Empty response (command not implemented in stock MCU firmware)":
    "استجابة فارغة (الأمر غير مدعوم في البرنامج المصنعي للمعالج)",
  "Selected:": "المحدد:",
  "Expected response:": "الاستجابة المتوقعة:",
  "Display raw unprocessed bytes/hex dump directly from the TCP socket":
    "عرض البايتات الخام / تفريغ HEX غير المعالج مباشرة من مقبس TCP",
  B: "بايت",
};
