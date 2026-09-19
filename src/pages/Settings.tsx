import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUpdater } from "@/components/updater/UpdaterProvider";
import { appInfo, type AppInfo } from "@/lib/api";

export function Settings() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    appInfo()
      .then(setInfo)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Paramètres"
        description="Les informations de la boutique, les utilisateurs et la sauvegarde seront ajoutés dans les prochaines étapes."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {error ? (
            <p className="text-destructive">{error}</p>
          ) : (
            <>
              <Row label="Version" value={info?.version ?? "—"} />
              <Row label="Fichier de base de données" value={info?.db_path ?? "—"} />
            </>
          )}
        </CardContent>
      </Card>

      <UpdatesCard />
    </div>
  );
}

/**
 * Manual entry point to the updater. The app already checks silently at
 * startup; this card is for "is it done yet?" after a release, and for
 * seeing *why* a check failed (the startup check swallows errors).
 */
function UpdatesCard() {
  const { status, checkNow, reopen } = useUpdater();
  const checking = status.kind === "checking";
  const busy = checking || status.kind === "downloading" || status.kind === "installing";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mises à jour</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          MedLib M3 vérifie automatiquement les nouvelles versions au démarrage. Une connexion
          Internet est nécessaire uniquement pour cette vérification.
        </p>

        <StatusLine status={status} />

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void checkNow()} disabled={busy}>
            <RefreshCw className={checking ? "animate-spin" : undefined} />
            {checking ? "Vérification…" : "Vérifier les mises à jour"}
          </Button>
          {status.kind === "available" && (
            <Button onClick={reopen}>
              <Download />
              Installer la version {status.update.version}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusLine({ status }: { status: ReturnType<typeof useUpdater>["status"] }) {
  switch (status.kind) {
    case "idle":
    case "checking":
      return null;
    case "up-to-date":
      return (
        <p className="text-muted-foreground">
          Vous utilisez la dernière version (vérifié à{" "}
          {status.checkedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}).
        </p>
      );
    case "available":
      return <p className="font-medium">La version {status.update.version} est disponible.</p>;
    case "downloading":
      return <p className="text-muted-foreground">Téléchargement de la version {status.update.version}…</p>;
    case "installing":
      return <p className="text-muted-foreground">Installation… l&apos;application va redémarrer.</p>;
    case "error":
      return <p className="text-destructive">{status.message}</p>;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all text-right font-mono text-xs">{value}</span>
    </div>
  );
}
