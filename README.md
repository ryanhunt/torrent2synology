# torrent2synology

A Chrome and Firefox extension that sends torrent files and magnet links to a Synology Download Station.

- Right-click a magnet link or `.torrent` link → **Send to Synology Download Station**
- Optional setting: left-click on such links sends them directly
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

Open the extension options, enter your NAS URL (the same address you use to reach DSM, including its port), a DSM username/password, and optionally a destination folder, then **Test connection**. Use a dedicated DSM account limited to Download Station. 2-step verification isn't supported for that account.

## Notes / TODO

- Self-signed NAS certificates must be trusted by the browser.
- Possible later: toolbar popup with task list, DSM 7 `SYNO.DownloadStation2` API, encrypted credential storage.

## Safeguards: no personal connection details in git

Your real NAS hostname, username and password must never be committed or pushed. They live only in the browser's extension storage. Sample hostnames and ports (e.g. `nas.local`, `5001`) are fine in code and docs.

- `scripts/check-secrets.mjs` blocks literal credentials, personal DDNS/QuickConnect hostnames, secret-looking files, and anything in your personal blocklist.
- **Personal blocklist:** put your real hostname (and anything else private) in `.git/secret-blocklist`, one per line. It lives inside `.git`, so it is never committed or pushed. Or set `T2S_BLOCKLIST=host1,host2`.
- Git hooks in `.githooks/` run the scanner on `pre-commit` (staged files), `commit-msg`, and `pre-push` (every commit being pushed). `npm install` enables them via `core.hooksPath`; otherwise run `git config core.hooksPath .githooks`.
- `.gitignore` excludes `.env*`, `*.local*`, keys and certs.
- A GitHub Actions workflow re-scans history for generic patterns as a backstop (it can't know your blocklist, and hooks are client-side so `--no-verify` skips them).
