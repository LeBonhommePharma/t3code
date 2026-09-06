import { SmartphoneIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import {
  AuthStandardClientScopes,
  type AdvertisedEndpoint,
  type AuthPairingCredentialResult,
} from "@t3tools/contracts";

import { createServerPairingCredential } from "~/environments/primary";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { QRCodeSvg } from "../ui/qr-code";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { resolveDesktopPairingUrl } from "./pairingUrls";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export const PairPhoneOnWifiRow = memo(function PairPhoneOnWifiRow({
  networkAccessible,
  lanEndpoint,
  canToggleNetwork,
  onEnableNetworkAccess,
  onPairingLinkCreated,
}: {
  readonly networkAccessible: boolean;
  readonly lanEndpoint: AdvertisedEndpoint | null;
  readonly canToggleNetwork: boolean;
  readonly onEnableNetworkAccess: () => void;
  readonly onPairingLinkCreated: (created: AuthPairingCredentialResult) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const lanUrl = lanEndpoint?.httpBaseUrl ?? null;

  const status = useMemo(() => {
    if (!networkAccessible) {
      return "This computer is only listening on itself. Turn on Wi-Fi pairing, then scan the QR from your phone.";
    }
    if (!lanEndpoint) {
      return "No LAN address yet. Connect this computer to Wi-Fi or Ethernet (not a guest network that blocks phones).";
    }
    return `Phone joins ${lanUrl}. Same Wi-Fi, then scan. Tailscale and T3 Connect stay under Other ways to connect.`;
  }, [lanEndpoint, lanUrl, networkAccessible]);

  const { copyToClipboard } = useCopyToClipboard<string>({
    onCopy: () => {
      toastManager.add({
        type: "success",
        title: "Pairing URL copied",
        description: "Open it on the phone if you cannot scan the QR.",
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not copy pairing URL",
          description: error.message,
        }),
      );
    },
  });

  const handleShowQr = useCallback(async () => {
    if (!lanEndpoint) return;
    setIsCreating(true);
    try {
      const created = await createServerPairingCredential({
        label: "Phone",
        scopes: [...AuthStandardClientScopes],
      });
      onPairingLinkCreated(created);
      setPairingUrl(resolveDesktopPairingUrl(lanEndpoint.httpBaseUrl, created.credential));
      setDialogOpen(true);
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not create phone pairing QR",
          description: error instanceof Error ? error.message : "Try again.",
        }),
      );
    } finally {
      setIsCreating(false);
    }
  }, [lanEndpoint, onPairingLinkCreated]);

  return (
    <>
      <SettingsRow
        {...searchableSetting("pair-phone")}
        description={status}
        control={
          !networkAccessible && canToggleNetwork ? (
            <Button size="sm" onClick={onEnableNetworkAccess}>
              <SmartphoneIcon className="size-3.5" />
              Turn on Wi-Fi pairing
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!lanEndpoint || isCreating}
              onClick={() => void handleShowQr()}
            >
              <SmartphoneIcon className="size-3.5" />
              {isCreating ? "Preparing…" : "Show QR"}
            </Button>
          )
        }
      />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogPopup className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pair phone on Wi-Fi</DialogTitle>
            <DialogDescription>
              On the phone, open T3 Code → Add environment → Scan QR. Stay on this Wi-Fi.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col items-center gap-3">
            {pairingUrl ? (
              <QRCodeSvg value={pairingUrl} size={220} marginSize={2} title="Phone pairing QR" />
            ) : null}
            {pairingUrl ? (
              <p className="w-full break-all text-center text-xs text-muted-foreground">
                {pairingUrl}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter variant="bare">
            <Button
              variant="outline"
              disabled={!pairingUrl}
              onClick={() => {
                if (pairingUrl) copyToClipboard(pairingUrl, pairingUrl);
              }}
            >
              Copy link
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
});
