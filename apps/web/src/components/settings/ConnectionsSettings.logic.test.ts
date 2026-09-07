import type { AdvertisedEndpoint, DesktopWslState } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  applyWslEnableSelection,
  deriveBrowserLanPairingEndpoint,
  isQrShareableEndpoint,
  isWslSettingsRowVisible,
  selectLanPairingEndpoint,
  selectQrEndpointOption,
} from "./ConnectionsSettings.logic";

const baseWslState: DesktopWslState = {
  enabled: false,
  distro: null,
  available: true,
  wslOnly: true,
  distros: [],
  preflightError: null,
};

describe("isWslSettingsRowVisible", () => {
  it("shows the retry row when the WSL state failed to load", () => {
    expect(isWslSettingsRowVisible({ state: null, error: "load failed" })).toBe(true);
  });

  it("hides an unavailable and unused WSL snapshot", () => {
    expect(
      isWslSettingsRowVisible({
        state: { ...baseWslState, available: false, wslOnly: false },
        error: null,
      }),
    ).toBe(false);
  });

  it("shows an available WSL snapshot", () => {
    expect(isWslSettingsRowVisible({ state: baseWslState, error: null })).toBe(true);
  });
});

describe("applyWslEnableSelection", () => {
  it("clears WSL-only and updates the distro before enabling both backends", async () => {
    const calls: Array<string> = [];
    let persistedWslOnly = true;
    let persistedDistro: string | null = "Ubuntu";
    const setWslDistro = vi.fn(async (distro: string | null) => {
      calls.push(`setWslDistro:${distro ?? "default"}`);
      persistedDistro = distro;
      return { ...baseWslState, distro, wslOnly: persistedWslOnly };
    });
    const setWslBackendEnabled = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslBackendEnabled:${enabled}`);
      return {
        ...baseWslState,
        enabled,
        distro: persistedDistro,
        wslOnly: persistedWslOnly,
      };
    });
    const setWslOnly = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslOnly:${enabled}`);
      persistedWslOnly = enabled;
      return { ...baseWslState, distro: persistedDistro, wslOnly: enabled };
    });

    const state = await applyWslEnableSelection({
      bridge: { setWslDistro, setWslBackendEnabled, setWslOnly },
      mode: "both",
      nextDistro: "Debian",
      persistedDistro: "Ubuntu",
    });

    expect(calls).toEqual(["setWslOnly:false", "setWslDistro:Debian", "setWslBackendEnabled:true"]);
    expect(state).toMatchObject({ enabled: true, distro: "Debian", wslOnly: false });
  });

  it("stages WSL-only before enabling without rewriting an unchanged distro", async () => {
    const calls: Array<string> = [];
    let persistedWslOnly = false;
    const setWslDistro = vi.fn(async () => baseWslState);
    const setWslOnly = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslOnly:${enabled}`);
      persistedWslOnly = enabled;
      return { ...baseWslState, wslOnly: enabled };
    });
    const setWslBackendEnabled = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslBackendEnabled:${enabled}`);
      return { ...baseWslState, enabled, wslOnly: persistedWslOnly };
    });

    const state = await applyWslEnableSelection({
      bridge: { setWslDistro, setWslBackendEnabled, setWslOnly },
      mode: "wsl-only",
      nextDistro: null,
      persistedDistro: null,
    });

    expect(calls).toEqual(["setWslOnly:true", "setWslBackendEnabled:true"]);
    expect(setWslDistro).not.toHaveBeenCalled();
    expect(state).toMatchObject({ enabled: true, wslOnly: true });
  });
});

function makeEndpoint(overrides: Partial<AdvertisedEndpoint>): AdvertisedEndpoint {
  return {
    id: "desktop-lan:http://192.168.1.42:4780",
    label: "Local network",
    provider: { id: "desktop-core", label: "Desktop", kind: "core", isAddon: false },
    httpBaseUrl: "http://192.168.1.42:4780",
    wsBaseUrl: "ws://192.168.1.42:4780",
    reachability: "lan",
    compatibility: { hostedHttpsApp: "unknown", desktopApp: "compatible" },
    source: "desktop-core",
    status: "available",
    ...overrides,
  };
}

describe("isQrShareableEndpoint", () => {
  it("excludes loopback endpoints so a scanned phone never dials itself", () => {
    expect(
      isQrShareableEndpoint(
        makeEndpoint({
          id: "desktop-loopback:4780",
          reachability: "loopback",
          httpBaseUrl: "http://127.0.0.1:4780",
        }),
      ),
    ).toBe(false);
  });

  it("excludes unavailable endpoints and keeps reachable ones", () => {
    expect(isQrShareableEndpoint(makeEndpoint({ status: "unavailable" }))).toBe(false);
    expect(isQrShareableEndpoint(makeEndpoint({}))).toBe(true);
    expect(
      isQrShareableEndpoint(makeEndpoint({ reachability: "private-network", status: "unknown" })),
    ).toBe(true);
  });
});

describe("selectLanPairingEndpoint", () => {
  it("prefers a LAN endpoint over Tailscale or loopback", () => {
    const lan = makeEndpoint({});
    const loopback = makeEndpoint({
      id: "desktop-loopback:4780",
      reachability: "loopback",
      httpBaseUrl: "http://127.0.0.1:4780",
    });
    const tailscale = makeEndpoint({
      id: "tailscale-ip:http://100.84.12.8:4780",
      reachability: "private-network",
      httpBaseUrl: "http://100.84.12.8:4780",
    });
    expect(selectLanPairingEndpoint([loopback, tailscale, lan])?.id).toBe(lan.id);
    expect(selectLanPairingEndpoint([loopback])).toBeNull();
  });

  it("does not fall back to a Tailscale private-network endpoint", () => {
    const loopback = makeEndpoint({
      id: "desktop-loopback:4780",
      reachability: "loopback",
      httpBaseUrl: "http://127.0.0.1:4780",
    });
    const tailscale = makeEndpoint({
      id: "tailscale-ip:http://100.84.12.8:4780",
      reachability: "private-network",
      httpBaseUrl: "http://100.84.12.8:4780",
    });
    expect(selectLanPairingEndpoint([loopback, tailscale])).toBeNull();
  });
});

describe("deriveBrowserLanPairingEndpoint", () => {
  it("uses the first same-Wi-Fi origin and skips loopback, Tailscale, and hosted app origins", () => {
    const endpoint = deriveBrowserLanPairingEndpoint([
      "http://127.0.0.1:5733",
      "https://app.t3.codes",
      "http://100.84.12.8:3773",
      "http://192.168.1.42:5733",
    ]);
    expect(endpoint).toMatchObject({
      id: "browser-origin:http://192.168.1.42:5733",
      httpBaseUrl: "http://192.168.1.42:5733/",
      reachability: "lan",
    });
  });

  it("returns null when no candidate is a LAN address", () => {
    expect(
      deriveBrowserLanPairingEndpoint(["http://localhost:5733", "https://app.t3.codes"]),
    ).toBeNull();
  });
});

describe("selectQrEndpointOption", () => {
  const options = [
    {
      id: "desktop-loopback:4780",
      preferenceKey: "desktop-core:loopback:http",
      qrShareable: false,
    },
    {
      id: "tailscale-ip:http://100.84.12.7:4780",
      preferenceKey: "tailscale:ip:http",
      qrShareable: true,
    },
    {
      id: "tailscale-ip:http://100.84.12.8:4780",
      preferenceKey: "tailscale:ip:http",
      qrShareable: true,
    },
    {
      id: "desktop-lan:http://192.168.1.42:4780",
      preferenceKey: "desktop-core:lan:http",
      qrShareable: true,
    },
  ];

  it("resolves an explicit selection by unique endpoint id, not the shared preference key", () => {
    expect(selectQrEndpointOption(options, "tailscale-ip:http://100.84.12.8:4780", null)?.id).toBe(
      "tailscale-ip:http://100.84.12.8:4780",
    );
  });

  it("falls back to the saved default preference key when nothing is selected", () => {
    expect(selectQrEndpointOption(options, null, "desktop-core:lan:http")?.id).toBe(
      "desktop-lan:http://192.168.1.42:4780",
    );
  });

  it("skips non-QR-shareable options in the fallback so the panel never opens on loopback", () => {
    expect(selectQrEndpointOption(options, "tailscale-ip:gone", "nope")?.id).toBe(
      "tailscale-ip:http://100.84.12.7:4780",
    );
  });

  it("returns the first option when nothing is QR-shareable, and null when empty", () => {
    const loopbackOnly = options.slice(0, 1);
    expect(selectQrEndpointOption(loopbackOnly, null, null)?.id).toBe("desktop-loopback:4780");
    expect(selectQrEndpointOption([], "anything", "anything")).toBeNull();
  });
});
