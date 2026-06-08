export interface UpdatePreferences {
  autoCheckUpdates: boolean;
  skippedVersion: string | null;
}

export type UpdateMode = "installer" | "source";

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
  finished: boolean;
}

export interface AvailableUpdate {
  mode: UpdateMode;
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
  install?: (onProgress?: (progress: UpdateProgress) => void) => Promise<void>;
}

export type UpdateCheckResult =
  | { status: "available"; update: AvailableUpdate }
  | { status: "current"; currentVersion: string }
  | { status: "disabled" }
  | { status: "skipped"; version: string };

interface GithubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string;
}

interface TauriUpdateLike {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall: (onEvent?: (event: TauriDownloadEvent) => void) => Promise<void>;
}

type TauriDownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished"; data?: never };

const UPDATE_PREFERENCES_KEY = "sillytavern-card-creator:update-preferences";
const GITHUB_LATEST_RELEASE_URL = "https://api.github.com/repos/EthanQing/Sillytavern-Card-Creator/releases/latest";
const DEFAULT_PREFERENCES: UpdatePreferences = {
  autoCheckUpdates: true,
  skippedVersion: null
};

export function getCurrentAppVersion(): string {
  return __APP_VERSION__;
}

export function loadUpdatePreferences(): UpdatePreferences {
  if (typeof localStorage === "undefined") {
    return DEFAULT_PREFERENCES;
  }
  try {
    const raw = localStorage.getItem(UPDATE_PREFERENCES_KEY);
    if (!raw) {
      return DEFAULT_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<UpdatePreferences>;
    return normalizeUpdatePreferences(parsed);
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveUpdatePreferences(preferences: UpdatePreferences): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(UPDATE_PREFERENCES_KEY, JSON.stringify(normalizeUpdatePreferences(preferences)));
}

export function setAutoCheckUpdates(autoCheckUpdates: boolean): UpdatePreferences {
  const next = {
    ...loadUpdatePreferences(),
    autoCheckUpdates
  };
  saveUpdatePreferences(next);
  return next;
}

export function skipUpdateVersion(version: string): UpdatePreferences {
  const next = {
    ...loadUpdatePreferences(),
    skippedVersion: version
  };
  saveUpdatePreferences(next);
  return next;
}

export function clearSkippedUpdateVersion(): UpdatePreferences {
  const next = {
    ...loadUpdatePreferences(),
    skippedVersion: null
  };
  saveUpdatePreferences(next);
  return next;
}

export function compareSemver(left: string, right: string): number {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  if (!leftVersion || !rightVersion) {
    return 0;
  }
  for (let index = 0; index < 3; index += 1) {
    const diff = leftVersion[index] - rightVersion[index];
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}

export function isNewerSemver(candidate: string, current: string): boolean {
  return compareSemver(candidate, current) > 0;
}

export async function checkForUpdates(options: {
  manual?: boolean;
  fetchImpl?: typeof fetch;
} = {}): Promise<UpdateCheckResult> {
  const preferences = loadUpdatePreferences();
  if (!options.manual && !preferences.autoCheckUpdates) {
    return { status: "disabled" };
  }

  const currentVersion = getCurrentAppVersion();
  const result = isInstallerUpdateRuntime()
    ? await checkInstallerUpdate(currentVersion)
    : await checkSourceUpdate(currentVersion, options.fetchImpl ?? fetch);

  if (result.status !== "available") {
    return result;
  }
  if (!options.manual && preferences.skippedVersion === result.update.version) {
    return { status: "skipped", version: result.update.version };
  }
  return result;
}

export function getUpdateModeLabel(mode: UpdateMode): "installer" | "source" {
  return mode;
}

async function checkInstallerUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = (await check()) as TauriUpdateLike | null;
  if (!update) {
    return { status: "current", currentVersion };
  }
  return {
    status: "available",
    update: {
      mode: "installer",
      currentVersion,
      version: normalizeVersionLabel(update.version),
      date: update.date,
      body: update.body,
      install: async (onProgress) => {
        await installTauriUpdate(update, onProgress);
      }
    }
  };
}

async function checkSourceUpdate(currentVersion: string, fetchImpl: typeof fetch): Promise<UpdateCheckResult> {
  const release = await fetchLatestGithubRelease(fetchImpl);
  const latestVersion = normalizeVersionLabel(release.tag_name ?? release.name ?? "");
  if (!latestVersion || !isNewerSemver(latestVersion, currentVersion)) {
    return { status: "current", currentVersion };
  }
  return {
    status: "available",
    update: {
      mode: "source",
      currentVersion,
      version: latestVersion,
      date: release.published_at,
      body: release.body
    }
  };
}

async function fetchLatestGithubRelease(fetchImpl: typeof fetch): Promise<GithubRelease> {
  const response = await fetchImpl(GITHUB_LATEST_RELEASE_URL, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub release check failed: ${response.status}`);
  }
  const value = (await response.json()) as unknown;
  return isRecord(value) ? (value as GithubRelease) : {};
}

async function installTauriUpdate(update: TauriUpdateLike, onProgress?: (progress: UpdateProgress) => void): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      downloaded = 0;
      total = typeof event.data.contentLength === "number" ? event.data.contentLength : null;
      onProgress?.({ downloaded, total, finished: false });
      return;
    }
    if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.({ downloaded, total, finished: false });
      return;
    }
    onProgress?.({ downloaded, total, finished: true });
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

function isInstallerUpdateRuntime(): boolean {
  return !import.meta.env.DEV && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeUpdatePreferences(preferences: Partial<UpdatePreferences>): UpdatePreferences {
  return {
    autoCheckUpdates: preferences.autoCheckUpdates !== false,
    skippedVersion: typeof preferences.skippedVersion === "string" && preferences.skippedVersion.trim() ? preferences.skippedVersion : null
  };
}

function normalizeVersionLabel(value: string): string {
  return value.trim().replace(/^v/u, "");
}

function parseSemver(value: string): [number, number, number] | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
