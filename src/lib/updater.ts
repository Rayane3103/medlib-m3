import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Self-update via GitHub Releases (see RELEASING.md).
 *
 * The updater plugin fetches `latest.json` from the endpoint in
 * tauri.conf.json, compares the version with the running one and verifies
 * the installer's signature against the public key baked into the app. All
 * of that lives in Rust; this file only sequences the UI-facing steps.
 */

/** Result of one check. `update` is `null` when we're already up to date. */
export type UpdateCheck = { update: Update | null };

/**
 * Ask GitHub whether a newer version exists. Throws on network/parse errors
 * so callers decide whether to show them (Settings) or ignore them (startup).
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  // In `tauri dev` the running version is whatever is in tauri.conf.json,
  // which usually lags the published release - a check would just nag.
  if (import.meta.env.DEV) return { update: null };
  const update = await check({ timeout: 15_000 });
  return { update };
}

export type DownloadProgress = {
  downloaded: number;
  /** Unknown until the server sends a Content-Length. */
  total: number | null;
};

/**
 * Download and install `update`, reporting progress along the way.
 *
 * On Windows the installer runs in passive mode and the updater exits the
 * app itself once it starts; `relaunch()` covers the other platforms and is
 * harmless here.
 */
export async function installUpdate(
  update: Update,
  onProgress: (p: DownloadProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? null;
        onProgress({ downloaded, total });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress({ downloaded, total });
        break;
      case "Finished":
        onProgress({ downloaded, total: total ?? downloaded });
        break;
    }
  });

  await relaunch();
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}
