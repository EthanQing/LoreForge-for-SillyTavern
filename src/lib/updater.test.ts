import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdates, compareSemver, isNewerSemver, saveUpdatePreferences } from "./updater";

describe("updater version helpers", () => {
  it("compares SemVer tags with or without a v prefix", () => {
    expect(isNewerSemver("v0.1.2", "0.1.0")).toBe(true);
    expect(isNewerSemver("0.1.2", "0.1.2")).toBe(false);
    expect(compareSemver("0.2.0", "0.1.9")).toBe(1);
    expect(compareSemver("0.1.0", "0.1.1")).toBe(-1);
  });

  it("ignores non-SemVer tags for update ordering", () => {
    expect(isNewerSemver("v0.1.0.2", "0.1.0")).toBe(false);
  });
});

describe("checkForUpdates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an available source update when GitHub has a newer SemVer release", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tag_name: "v0.1.3", body: "New release", published_at: "2026-06-08T00:00:00Z" })
    })) as unknown as typeof fetch;

    const result = await checkForUpdates({ manual: true, fetchImpl });

    expect(result.status).toBe("available");
    expect(result.status === "available" ? result.update.mode : undefined).toBe("source");
    expect(result.status === "available" ? result.update.install : undefined).toBeUndefined();
  });

  it("does not report an update when GitHub has the current version", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tag_name: "v0.1.2" })
    })) as unknown as typeof fetch;

    const result = await checkForUpdates({ manual: true, fetchImpl });

    expect(result.status).toBe("current");
  });

  it("does not request GitHub when automatic checks are disabled", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    });
    saveUpdatePreferences({ autoCheckUpdates: false, skippedVersion: null });
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const result = await checkForUpdates({ fetchImpl });

    expect(result.status).toBe("disabled");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
