import { isLoopbackPairingHostname } from "@t3tools/client-runtime/connection";
import type { AdvertisedEndpoint, DesktopBridge, DesktopWslState } from "@t3tools/contracts";
import { createAdvertisedEndpoint } from "@t3tools/shared/advertisedEndpoint";
import { isPrivateNetworkHost, normalizeHostname } from "@t3tools/shared/hostClassification";

type WslEnableBridge = Pick<DesktopBridge, "setWslBackendEnabled" | "setWslDistro" | "setWslOnly">;

const BROWSER_LAN_ENDPOINT_PROVIDER = {
  id: "server",
  label: "Server",
  kind: "core",
  isAddon: false,
} as const;

/**
 * A QR code encoding a loopback URL makes the scanning device dial itself, so
 * loopback endpoints stay copyable from the endpoint menu but are never
 * offered as QR targets.
 */
export function isQrShareableEndpoint(endpoint: AdvertisedEndpoint): boolean {
  return endpoint.status !== "unavailable" && endpoint.reachability !== "loopback";
}

function isTailscalePairingHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (host === "ts.net" || host.endsWith(".ts.net")) return true;
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number.parseInt(part, 10));
  return (
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) &&
    octets[0] === 100 &&
    octets[1]! >= 64 &&
    octets[1]! <= 127
  );
}

function isSameWifiPairingHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (host.length === 0 || host === "0.0.0.0" || host === "::") return false;
  if (isLoopbackPairingHostname(host) || isTailscalePairingHost(host)) return false;
  return isPrivateNetworkHost(host);
}

function advertisedLanEndpointFromUrl(raw: string): AdvertisedEndpoint | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!isSameWifiPairingHost(url.hostname)) return null;
  return createAdvertisedEndpoint({
    id: `browser-origin:${url.origin}`,
    label: "Local network",
    provider: BROWSER_LAN_ENDPOINT_PROVIDER,
    httpBaseUrl: url.origin,
    reachability: "lan",
    source: "server",
  });
}

/** Same-LAN QR target: ignore Tailscale / loopback / hosted HTTPS. */
export function selectLanPairingEndpoint(
  endpoints: ReadonlyArray<AdvertisedEndpoint>,
): AdvertisedEndpoint | null {
  const available = endpoints.filter((endpoint) => isQrShareableEndpoint(endpoint));
  return (
    available.find((endpoint) => endpoint.reachability === "lan") ??
    available.find((endpoint) => endpoint.id.startsWith("desktop-lan:")) ??
    null
  );
}

/**
 * Browser / `npx t3` web has no desktop advertised-endpoint list. When the
 * page origin (or server HTTP URL) is a same-Wi-Fi address, mint a LAN
 * endpoint so Show QR still works.
 */
export function deriveBrowserLanPairingEndpoint(
  candidateUrls: ReadonlyArray<string | null | undefined>,
): AdvertisedEndpoint | null {
  for (const candidate of candidateUrls) {
    if (candidate == null || candidate.trim() === "") continue;
    const endpoint = advertisedLanEndpointFromUrl(candidate);
    if (endpoint) return endpoint;
  }
  return null;
}

export function isWslSettingsRowVisible(input: {
  readonly state: DesktopWslState | null;
  readonly error: string | null;
}): boolean {
  const { state, error } = input;
  return state ? state.available || state.enabled || state.wslOnly : error !== null;
}

export type QrEndpointOption = {
  /** Unique per endpoint instance (AdvertisedEndpoint.id); safe as a React key. */
  readonly id: string;
  /**
   * Stable per endpoint *type* (endpointDefaultPreferenceKey). Multiple
   * endpoints can share one, so it is only used to match the saved default.
   */
  readonly preferenceKey: string;
  /** False for endpoints that stay copyable but must never render as a QR. */
  readonly qrShareable: boolean;
};

/**
 * Resolves which endpoint the share panel shows: the user's explicit pick,
 * else the saved default endpoint, else the first QR-shareable option (so the
 * panel never opens on a loopback QR), else the first option. A stale
 * selectedId (endpoint disappeared) falls back rather than blanking the panel.
 */
export function selectQrEndpointOption<T extends QrEndpointOption>(
  options: ReadonlyArray<T>,
  selectedId: string | null,
  defaultPreferenceKey: string | null,
): T | null {
  return (
    (selectedId !== null ? options.find((option) => option.id === selectedId) : undefined) ??
    (defaultPreferenceKey !== null
      ? options.find((option) => option.preferenceKey === defaultPreferenceKey)
      : undefined) ??
    options.find((option) => option.qrShareable) ??
    options[0] ??
    null
  );
}

export async function applyWslEnableSelection(input: {
  readonly bridge: WslEnableBridge;
  readonly mode: "both" | "wsl-only";
  readonly nextDistro: string | null;
  readonly persistedDistro: string | null;
}): Promise<DesktopWslState> {
  const { bridge, mode, nextDistro, persistedDistro } = input;

  // Stage every preference before enabling. The desktop only relaunches for
  // mode/distro changes while WSL is active, so the final enable observes the
  // complete selection and is the only call that may relaunch.
  await bridge.setWslOnly(mode === "wsl-only");
  if (persistedDistro !== nextDistro) {
    await bridge.setWslDistro(nextDistro);
  }
  return await bridge.setWslBackendEnabled(true);
}
