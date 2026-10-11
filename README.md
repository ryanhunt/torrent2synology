# torrent2synology

A Chrome and Firefox extension that sends torrent files and magnet links to a Synology Download Station.

- Right-click a link (magnet, `.torrent`, or any URL; Chrome cannot filter the menu to magnet links, so it appears on all links) → **Send to Synology Download Station**
- Configurable download folders (e.g. TV Shows, Movies): with more than one, the right-click menu becomes a submenu so you pick where each download goes
- Optional setting (off by default): left-click on magnet/torrent links sends them directly to a separate "left-click folder" (blank = Download Station default)
- Talks to DSM's Download Station Web API (auth v6 + task v1); no server component needed

## Development

```bash
npm install
npm run run:firefox   # or run:chrome — launches a browser with the extension loaded
npm run lint
npm run build         # dist/torrent2synology.zip
```

Source lives in `src/` (plain JS, no bundler). Manual load: Chrome → `chrome://extensions` → Load unpacked → `src/`; Firefox → `about:debugging` → Load Temporary Add-on → `src/manifest.json`.

## Setup

Open the extension options, enter your NAS URL (the same address you use to reach DSM, including its port), a DSM username/password, and one or more download folders (labels like TV Shows / Movies mapped to NAS folders, relative to the share root such as `video/Movies`), then **Test connection**. Use a dedicated DSM account limited to Download Station. If the account uses 2-step verification, enter a current code in the options and click **Test connection** once. DSM registers the browser as a trusted device and the extension stores the device token, so later sends need no code. If DSM revokes the device (e.g. you remove it under Security), repeat that step. Only the DSM Web API is supported (no QuickConnect or other protocols).

## Password protection (optional, off by default)

Tick **Protect the password with a passphrase** in the options and click Save. The password is then stored encrypted (PBKDF2 + AES-GCM); the decrypted copy lives only in session storage (memory) and is wiped when the browser closes. After a restart, sends open the settings page until you unlock with your passphrase. If you forget the passphrase, just re-enter the password. `npm test` runs the crypto round-trip tests.

## Notes / TODO

- Self-signed NAS certificates must be trusted by the browser.
- Possible later: toolbar popup with task list, DSM 7 `SYNO.DownloadStation2` API.

## Safeguards: no personal connection details in git

Your real NAS hostname, username and password must never be committed or pushed. They live only in the browser's extension storage. Sample hostnames and ports (e.g. `nas.local`, `5001`) are fine in code and docs.

- `scripts/check-secrets.mjs` blocks literal credentials, personal DDNS/QuickConnect hostnames, secret-looking files, and anything in your personal blocklist.
- **Personal blocklist:** put your real hostname (and anything else private) in `.git/secret-blocklist`, one per line. It lives inside `.git`, so it is never committed or pushed. Or set `T2S_BLOCKLIST=host1,host2`.
- Git hooks in `.githooks/` run the scanner on `pre-commit` (staged files), `commit-msg`, and `pre-push` (every commit being pushed). `npm install` enables them via `core.hooksPath`; otherwise run `git config core.hooksPath .githooks`.
- `.gitignore` excludes `.env*`, `*.local*`, keys and certs.
- No GitHub Actions are used in this repo; the local hooks are the only enforcement (`--no-verify` skips them).
