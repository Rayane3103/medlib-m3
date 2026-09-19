import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { listen } from "@tauri-apps/api/event";
import { Smartphone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getScanSession,
  setScanListenerActive,
  CART_LINE_EVENT,
  SCAN_EVENT,
  SCAN_NOT_FOUND_EVENT,
  type CartLineChange,
  type ScannedProduct,
} from "@/lib/api";

type Props = {
  onScan: (product: ScannedProduct) => void;
  /** A phone scan matched nothing - offer to create the product. */
  onNotFound: (barcode: string) => void;
  /** The cashier changed a quantity (or removed a line) from the phone. */
  onLineChange: (change: CartLineChange) => void;
};

/**
 * Shows a QR code the cashier's phone can scan to turn it into a barcode
 * scanner for this session. Products scanned on the phone arrive here via a
 * Tauri event (see scan_server.rs) and are forwarded to the cart, as do
 * quantity edits made in the phone's cart view.
 */
export function PhoneScanPanel({ onScan, onNotFound, onLineChange }: Props) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  // The Tauri listeners are registered once, but the handlers close over
  // the POS page's current state (which cart is active, etc.), so always
  // call through a ref to the latest props rather than the mount-time ones.
  const handlers = useRef({ onScan, onNotFound, onLineChange });
  handlers.current = { onScan, onNotFound, onLineChange };

  useEffect(() => {
    getScanSession()
      .then((s) => setUrl(s.url))
      .catch(() => setUrl(null));

    setScanListenerActive(true).catch(() => {});

    const unlistenScanned = listen<ScannedProduct>(SCAN_EVENT, (event) => {
      handlers.current.onScan(event.payload);
    }).catch(() => null);

    const unlistenNotFound = listen<{ barcode: string }>(SCAN_NOT_FOUND_EVENT, (event) => {
      handlers.current.onNotFound(event.payload.barcode);
    }).catch(() => null);

    const unlistenLine = listen<CartLineChange>(CART_LINE_EVENT, (event) => {
      handlers.current.onLineChange(event.payload);
    }).catch(() => null);

    return () => {
      setScanListenerActive(false).catch(() => {});
      unlistenScanned.then((fn) => fn?.());
      unlistenNotFound.then((fn) => fn?.());
      unlistenLine.then((fn) => fn?.());
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Smartphone className="h-4 w-4" />
          Scanner avec le téléphone
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-2 pb-4 text-center">
        {url === undefined && (
          <p className="py-6 text-xs text-muted-foreground">Chargement…</p>
        )}
        {url === null && (
          <p className="py-6 text-xs text-muted-foreground">
            Indisponible : ce PC n'est connecté à aucun réseau. Connectez-le au
            Wi-Fi/réseau local de la boutique pour scanner avec un téléphone. Une
            douchette USB et la recherche manuelle fonctionnent normalement.
          </p>
        )}
        {url && (
          <>
            <div className="rounded-md border bg-white p-2">
              <QRCodeSVG value={url} size={140} />
            </div>
            <p className="text-xs text-muted-foreground">
              Scannez ce code avec l'appareil photo de votre téléphone. La première
              fois, le téléphone avertira que la connexion n'est pas privée : c'est
              normal pour un outil en réseau local ; appuyez sur « Paramètres avancés »
              puis « Continuer ».
            </p>
            <details className="w-full text-left text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none text-center">
                La page ne s'ouvre pas sur le téléphone ?
              </summary>
              <p className="mt-2">
                Windows bloque peut-être la connexion parce qu'il considère ce réseau
                Wi-Fi comme « Public ». Sur ce PC : Paramètres → Réseau et Internet →
                Wi-Fi → cliquez sur votre réseau → réglez{" "}
                <strong>Type de profil réseau</strong> sur <strong>Privé</strong>.
                Réessayez ensuite avec le téléphone, sans redémarrer. (Une douchette
                USB fonctionne toujours, quel que soit ce réglage.)
              </p>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
