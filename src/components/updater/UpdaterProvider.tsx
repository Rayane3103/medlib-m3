import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { Clock, Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  checkForUpdate,
  formatBytes,
  installUpdate,
  type DownloadProgress,
} from "@/lib/updater";

/**
 * Where the updater is in its lifecycle. `available` is the only state that
 * opens the dialog; `up-to-date`/`error` are surfaced in Settings only, so a
 * failed check on startup (no Internet, GitHub down) never bothers the cashier.
 */
export type UpdaterStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date"; checkedAt: Date }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; update: Update; progress: DownloadProgress }
  | { kind: "installing"; update: Update }
  | { kind: "error"; message: string };

type UpdaterContextValue = {
  status: UpdaterStatus;
  /** Check now. Never throws - failures land in `status`. */
  checkNow: () => Promise<void>;
  /** Start downloading the update currently in `status.available`. */
  install: () => Promise<void>;
  /** Close the dialog without installing. The check on next launch will ask again. */
  dismiss: () => void;
  /** Re-open the dialog for an update that was dismissed earlier. */
  reopen: () => void;
};

const UpdaterContext = createContext<UpdaterContextValue | null>(null);

/** Delay before the silent startup check so it never competes with the POS loading. */
const STARTUP_CHECK_DELAY_MS = 4_000;

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdaterStatus>({ kind: "idle" });
  const [dialogOpen, setDialogOpen] = useState(false);
  // Guards against two checks overlapping (startup timer + Settings button).
  const busy = useRef(false);

  const checkNow = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus({ kind: "checking" });
    try {
      const { update } = await checkForUpdate();
      if (update) {
        setStatus({ kind: "available", update });
        setDialogOpen(true);
      } else {
        setStatus({ kind: "up-to-date", checkedAt: new Date() });
      }
    } catch (e) {
      setStatus({ kind: "error", message: describeError(e) });
    } finally {
      busy.current = false;
    }
  }, []);

  const install = useCallback(async () => {
    if (status.kind !== "available") return;
    const { update } = status;
    setDialogOpen(true);
    setStatus({ kind: "downloading", update, progress: { downloaded: 0, total: null } });
    try {
      await installUpdate(update, (progress) => {
        const done = progress.total !== null && progress.downloaded >= progress.total;
        setStatus(done ? { kind: "installing", update } : { kind: "downloading", update, progress });
      });
      setStatus({ kind: "installing", update });
    } catch (e) {
      setStatus({ kind: "error", message: describeError(e) });
    }
  }, [status]);

  const dismiss = useCallback(() => setDialogOpen(false), []);
  const reopen = useCallback(() => setDialogOpen(true), []);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkNow(), STARTUP_CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [checkNow]);

  const value = useMemo(
    () => ({ status, checkNow, install, dismiss, reopen }),
    [status, checkNow, install, dismiss, reopen],
  );

  return (
    <UpdaterContext.Provider value={value}>
      {children}
      <UpdateDialog open={dialogOpen} status={status} onInstall={install} onDismiss={dismiss} />
    </UpdaterContext.Provider>
  );
}

export function useUpdater(): UpdaterContextValue {
  const ctx = useContext(UpdaterContext);
  if (!ctx) throw new Error("useUpdater must be used inside <UpdaterProvider>");
  return ctx;
}

function describeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  // The plugin's messages are English and technical; map the common ones.
  if (/network|connect|dns|timed? ?out|request|resolve/i.test(raw)) {
    return "Impossible de contacter le serveur de mises à jour. Vérifiez la connexion Internet.";
  }
  if (/signature/i.test(raw)) {
    return "La mise à jour téléchargée n'est pas authentique et a été refusée.";
  }
  return raw;
}

type DialogProps = {
  open: boolean;
  status: UpdaterStatus;
  onInstall: () => void;
  onDismiss: () => void;
};

function UpdateDialog({ open, status, onInstall, onDismiss }: DialogProps) {
  const update =
    status.kind === "available" || status.kind === "downloading" || status.kind === "installing"
      ? status.update
      : null;
  // Once the download has started there is no going back - the installer
  // will take over and restart the app - so the dialog can't be closed.
  const locked = status.kind === "downloading" || status.kind === "installing";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !locked && onDismiss()}>
      <DialogContent
        className="max-w-lg"
        hideClose={locked}
        onEscapeKeyDown={(e) => locked && e.preventDefault()}
        onPointerDownOutside={(e) => locked && e.preventDefault()}
      >
        <DialogHeader>
          {/* The new version number is always in the title - it is the one
              thing the cashier needs to be able to read off at a glance. */}
          <DialogTitle>
            {update ? `Mise à jour disponible : version ${update.version}` : "Mise à jour"}
          </DialogTitle>
          <DialogDescription>
            {update
              ? `Vous utilisez la version ${update.currentVersion}. La version ${update.version} de MedLib M3 est prête à être installée.`
              : "Recherche de mises à jour…"}
          </DialogDescription>
        </DialogHeader>

        {update?.body && status.kind === "available" && (
          <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm">
            <p className="mb-1 font-medium">Nouveautés</p>
            <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{update.body}</pre>
          </div>
        )}

        {status.kind === "downloading" && <ProgressBar progress={status.progress} />}

        {status.kind === "installing" && (
          <p className="text-sm text-muted-foreground">
            Installation en cours… L&apos;application va redémarrer automatiquement.
          </p>
        )}

        {status.kind === "error" && <p className="text-sm text-destructive">{status.message}</p>}

        {status.kind === "available" && (
          <p className="text-xs text-muted-foreground">
            L&apos;installation prend moins d&apos;une minute et redémarre l&apos;application. Si vous
            choisissez d&apos;attendre, ce message reviendra à chaque lancement jusqu&apos;à la mise à
            jour.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {status.kind === "available" && (
            <>
              <Button variant="outline" onClick={onDismiss}>
                <Clock />
                Me le rappeler au prochain lancement
              </Button>
              <Button onClick={onInstall}>
                <Download />
                Mettre à jour et redémarrer maintenant
              </Button>
            </>
          )}
          {status.kind === "error" && (
            <Button variant="outline" onClick={onDismiss}>
              Fermer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressBar({ progress }: { progress: DownloadProgress }) {
  const pct = progress.total
    ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
    : null;
  return (
    <div className="space-y-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={
            pct === null ? "h-full w-1/3 animate-pulse bg-primary" : "h-full bg-primary transition-[width]"
          }
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw className="size-3 animate-spin" />
        Téléchargement… {formatBytes(progress.downloaded)}
        {progress.total ? ` / ${formatBytes(progress.total)} (${pct} %)` : ""}
      </p>
    </div>
  );
}
