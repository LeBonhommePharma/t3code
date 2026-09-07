import { describe, expect, it } from "@effect/vitest";

import {
  hostnameFromUrl,
  isIosSimulatorClient,
  isLoopbackPairingHostname,
  loopbackPairingBlock,
  LOOPBACK_PHONE_PAIRING_DETAIL,
} from "./lanPairingErrors.ts";

describe("isLoopbackPairingHostname", () => {
  it("treats 127/8 IPv4, ::1, and RFC 6761 localhost names as loopback", () => {
    for (const host of [
      "127.0.0.1",
      "127.255.255.255",
      "localhost",
      "LOCALHOST",
      "localhost.",
      "foo.localhost",
      "api.app.localhost.",
      "::1",
      "[::1]",
    ]) {
      expect(isLoopbackPairingHostname(host), host).toBe(true);
    }
  });

  it("does not treat 127-prefixed DNS names or LAN addresses as loopback", () => {
    for (const host of [
      "127.example.com",
      "127.0.0.1.example.com",
      "192.168.1.9",
      "10.0.0.1",
      "example.localhost.com",
      "localhost.example.com",
    ]) {
      expect(isLoopbackPairingHostname(host), host).toBe(false);
    }
  });
});

describe("loopbackPairingBlock", () => {
  const phone = { surface: "mobile", deviceType: "mobile", os: "iOS" };

  it("blocks a physical phone from pairing to loopback before fetch", () => {
    const blocked = loopbackPairingBlock("http://127.0.0.1:3773/", phone);
    expect(blocked?.message).toBe(LOOPBACK_PHONE_PAIRING_DETAIL);
  });

  it("allows iOS Simulator localhost pairing because loopback is the host Mac", () => {
    expect(
      loopbackPairingBlock("http://127.0.0.1:3773/", {
        surface: "mobile",
        deviceType: "mobile",
        os: "iOS Simulator",
      }),
    ).toBeNull();
    expect(isIosSimulatorClient({ os: "iOS Simulator" })).toBe(true);
    expect(isIosSimulatorClient({ os: "iOS" })).toBe(false);
  });

  it("allows a phone to pair to a LAN address", () => {
    expect(loopbackPairingBlock("http://192.168.1.9:3773/", phone)).toBeNull();
  });

  it("reads the hostname from a pairing URL", () => {
    expect(hostnameFromUrl("http://127.example.com:3773/pair#token=abc")).toBe("127.example.com");
  });
});
