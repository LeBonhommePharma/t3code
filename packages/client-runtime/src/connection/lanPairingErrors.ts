import { ConnectionBlockedError } from "./model.ts";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLoopbackPairingHostname(hostname: string): boolean {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return (
    LOOPBACK_HOSTS.has(host) ||
    LOOPBACK_HOSTS.has(hostname.trim().toLowerCase()) ||
    host.startsWith("127.")
  );
}

export function hostnameFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    const match = value.match(/https?:\/\/([^/:\s]+)/i);
    return match?.[1] ?? null;
  }
}

export function isPhoneLikeClient(metadata: {
  readonly surface?: string;
  readonly deviceType?: string;
}): boolean {
  return (
    metadata.surface === "mobile" ||
    metadata.deviceType === "mobile" ||
    metadata.deviceType === "tablet"
  );
}

export const LOOPBACK_PHONE_PAIRING_DETAIL =
  "This pairing link points at localhost. The phone would dial itself, not the computer. On the computer, open Settings → Pair phone on Wi-Fi (or run t3 pair after enabling network access) so the QR uses a LAN address like 192.168.x.x.";

export function loopbackPairingBlock(
  httpBaseUrl: string,
  metadata: { readonly surface?: string; readonly deviceType?: string },
): ConnectionBlockedError | null {
  if (!isPhoneLikeClient(metadata)) return null;
  const hostname = hostnameFromUrl(httpBaseUrl);
  if (!hostname || !isLoopbackPairingHostname(hostname)) return null;
  return new ConnectionBlockedError({
    reason: "configuration",
    detail: LOOPBACK_PHONE_PAIRING_DETAIL,
  });
}

function causeText(cause: unknown): string {
  if (cause instanceof Error) {
    const nested = cause.cause !== undefined ? ` ${causeText(cause.cause)}` : "";
    return `${cause.name} ${cause.message}${nested}`;
  }
  return String(cause);
}

export function describeDirectPairingFailure(input: {
  readonly requestUrl?: string;
  readonly message: string;
  readonly cause?: unknown;
}): string {
  const blob = `${input.requestUrl ?? ""} ${input.message} ${causeText(input.cause)}`.toLowerCase();
  const hostname = hostnameFromUrl(input.requestUrl ?? "") ?? hostnameFromUrl(input.message);

  if (hostname && isLoopbackPairingHostname(hostname)) {
    return LOOPBACK_PHONE_PAIRING_DETAIL;
  }
  if (blob.includes("econnrefused") || blob.includes("connection refused")) {
    return `Nothing is accepting connections${hostname ? ` on ${hostname}` : ""}. On the computer, turn on Network access (Settings → Pair phone on Wi-Fi) or restart with --host 0.0.0.0, and allow the port through the firewall.`;
  }
  if (
    blob.includes("enotfound") ||
    blob.includes("eai_again") ||
    blob.includes("err_name_not_resolved")
  ) {
    return `Could not resolve ${hostname ?? "that host"}. Check the pairing URL.`;
  }
  if (
    blob.includes("enetunreach") ||
    blob.includes("ehostunreach") ||
    blob.includes("network is down") ||
    blob.includes("network unreachable")
  ) {
    return `This device cannot route to ${hostname ?? "the computer"}. Join the same Wi-Fi (guest/IoT networks often block phone-to-computer). Tailscale or T3 Connect are optional fallbacks.`;
  }
  if (
    blob.includes("etimedout") ||
    blob.includes("timed out") ||
    blob.includes("timeout") ||
    blob.includes("aborterror")
  ) {
    return `Timed out reaching ${hostname ?? "the computer"}. Usually the wrong Wi-Fi/VLAN, AP isolation, or a firewall blocking the port. Stay on the same network as the computer, or use Tailscale / T3 Connect.`;
  }
  if (blob.includes("failed to fetch") || blob.includes("network")) {
    return `Could not reach ${hostname ?? "the T3 Code server"} from this device. Use the same Wi-Fi as the computer, confirm the port is not blocked, and scan a LAN QR (not localhost).`;
  }
  return input.message;
}
