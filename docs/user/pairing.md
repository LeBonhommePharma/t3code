# Pair a phone on Wi-Fi

Three steps. Same network. Scan a QR. You do not need Tailscale for this.

## 1. Same Wi-Fi

Join the phone to the same Wi-Fi as the computer. Guest and IoT networks often block phones from reaching other devices; use the main network.

## 2. Show the QR on the computer

Open **Settings → Pair phone on Wi-Fi**.

If this computer is only listening on itself, turn on **Wi-Fi pairing**, then show the QR. If a LAN address is already listed, show the QR.

On a command-line server that already listens on the LAN, run `npx t3 pair --lan`. That command refuses a localhost link instead of showing a QR the phone cannot use.

If `npx t3 pair` produced a localhost QR, restart the server so other devices can reach it, then mint a LAN QR. `serve` stays running, so use two terminals:

```bash
npx t3 serve --host 0.0.0.0
```

```bash
npx t3 pair --lan
```

## 3. Scan on the phone

In the T3 Code app, add an environment and scan the QR. Do not type `127.0.0.1` — that is the phone itself.

## If pairing fails

- **The QR is localhost / 127.0.0.1.** The phone would dial itself. On the desktop, turn on Wi-Fi pairing and scan again. For CLI pairing, restart the server with `npx t3 serve --host 0.0.0.0`, then rerun `npx t3 pair --lan`.
- **Connection refused.** The server is not accepting network connections, or the port is blocked. Turn on Wi-Fi pairing or allow the port through the firewall.
- **Timed out or unreachable.** The phone is on a different network, a guest Wi-Fi, or a VLAN that isolates clients. Move to the computer's network, or use Tailscale / T3 Connect from [remote access](./remote-access.md) as a fallback.

Links created in Settings can only be copied from the client that created them while that page stays open. If you leave or reload, create another link.
