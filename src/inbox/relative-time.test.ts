import { describe, expect, it } from "vitest";
import { formatRelativeAge } from "./relative-time";

const now = new Date("2026-08-29T12:00:00Z").valueOf();

describe("formatRelativeAge", () => {
  it("shows just now for events under a minute old", () => {
    expect(formatRelativeAge("2026-08-29T11:59:30Z", now)).toBe("just now");
  });

  it("shows whole minutes for events under an hour old", () => {
    expect(formatRelativeAge("2026-08-29T11:45:00Z", now)).toBe("15m ago");
  });

  it("shows whole hours for events under a day old", () => {
    expect(formatRelativeAge("2026-08-29T09:00:00Z", now)).toBe("3h ago");
  });

  it("shows whole days for events under a month old", () => {
    expect(formatRelativeAge("2026-08-27T12:00:00Z", now)).toBe("2d ago");
  });

  it("falls back to a locale date beyond a month", () => {
    const then = new Date("2026-01-01T12:00:00Z");
    expect(formatRelativeAge(then.toISOString(), now)).toBe(then.toLocaleDateString());
  });

  it("clamps a future timestamp to just now instead of a negative age", () => {
    expect(formatRelativeAge("2026-08-29T12:05:00Z", now)).toBe("just now");
  });

  it("returns the raw value when it cannot be parsed as a date", () => {
    expect(formatRelativeAge("not-a-date", now)).toBe("not-a-date");
  });
});
