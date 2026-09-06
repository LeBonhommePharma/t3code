# Pair a phone on the same Wi-Fi

Three steps. Same network. Scan a QR. No Tailscale required.

## 1. Same Wi-Fi

Put the phone and the computer on the same Wi-Fi or Ethernet LAN. Skip guest / IoT / "client isolation" networks — those block the phone from talking to the computer.

## 2. Show a LAN QR on the computer

In the T3 Code desktop app: **Settings → Pair phone on Wi-Fi**.

- If the computer is only listening on itself, choose **Turn on Wi-Fi pairing**, then show the QR.
- If a LAN address is already there, choose **Show QR**.

From a terminal on a server that already listens on the LAN:

```bash
npx t3 pair --lan
```

`--lan` refuses a localhost URL instead of printing a QR the phone cannot use. If the server is still on loopback, restart it so other devices can reach it (`npx t3 serve --host 0.0.0.0`, or the desktop Wi-Fi pairing toggle).

## 3. Scan on the phone

In the T3 Code phone app, **Add environment → Scan QR**. Stay on that Wi-Fi. You should not type `127.0.0.1`.

## If it fails

| What you see                                    | What to do                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pairing link / QR is `127.0.0.1` or `localhost` | That address is this device, not the computer. Go back to step 2 and get a `192.168…` / `10…` QR.                                                      |
| Connection refused                              | T3 is not accepting LAN connections, or the port is firewalled. Turn on Wi-Fi pairing (desktop) or restart with `--host 0.0.0.0`, then allow the port. |
| Timed out / unreachable                         | Wrong Wi-Fi, guest network, AP isolation, or VLAN. Same network as the computer.                                                                       |
| Host not found                                  | The pairing URL is wrong or DNS failed. Scan again; do not type localhost.                                                                             |

Tailscale HTTPS and T3 Connect stay available under **Settings → Other ways to connect** when the phone is not on this LAN. They are fallbacks, not the first fix.

Full product notes: [Remote access](./user/remote-access.md).
