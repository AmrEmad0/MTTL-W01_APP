import { expect, test } from "bun:test";
import { readPreference, writePreference } from "../src/preferences";

test("blocked browser storage does not break loading or saving preferences", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("Storage unavailable", "SecurityError");
    },
  });
  try {
    expect(readPreference("mttl_analyzer_period")).toBeNull();
    expect(() => writePreference("mttl_analyzer_period", "24")).not.toThrow();
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
