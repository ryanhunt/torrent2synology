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

Source lives in `src/` (plain JS, no bundler). The options page uses Bootstrap's CSS, vendored at `src/vendor/bootstrap.min.css` (refresh it with `npm run vendor` after upgrading the `bootstrap` dev dependency). Manual load: Chrome → `chrome://extensions` → Load unpacked → `src/`; Firefox → `about:debugging` → Load Temporary Add-on → `src/manifest.json`.

## Installing permanently

Loading from `about:debugging` (Firefox) is temporary: Firefox removes the add-on and its saved settings when it quits. Chrome's "Load unpacked" persists, but needs Developer mode. For a lasting install:

### Chrome

- **Load unpacked (simplest):** `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → select the `src/` folder. Keep that folder in place; Chrome reads it directly, and settings persist across restarts. Chrome may nag about developer-mode extensions at startup, and a managed (work) browser may block this.
- **Chrome Web Store:** run `npm run build` and upload `dist/torrent2synology.zip` to the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (one-time developer fee). You can publish it as *Unlisted* so only people with the link can install it, and Chrome then updates it for you.

### Firefox

Release Firefox only installs add-ons signed by Mozilla. An unlisted signature is free and doesn't publish the add-on anywhere:

1. Create a free account on [addons.mozilla.org](https://addons.mozilla.org/developers/) and generate API credentials at *Tools → Manage API Keys*.
2. Export them in your shell as `AMO_JWT_ISSUER` (the API key) and `AMO_JWT_SECRET` (the API secret). Never put them in a file in the repo.

3. Sign it:

   ```bash
   npx web-ext sign --source-dir src --channel unlisted \
     --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
   ```

   This writes a signed `.xpi` to `web-ext-artifacts/`.
4. Install it: open the `.xpi` in Firefox (or `about:addons` → gear icon → **Install Add-on From File…**). It stays installed, keeps its settings across restarts, and Firefox asks for the permissions it needs.

Notes:

- Each signing request needs a **higher version number** than the last. Bump `version` in `src/manifest.json` (and `package.json` to match) before signing; the settings page footer shows the installed version.
- Unlisted add-ons don't auto-update. To upgrade, sign and install the newer `.xpi`.
- Alternatively, you can list it publicly on addons.mozilla.org (`--channel listed` or the developer hub), which gives automatic updates. Firefox Developer Edition and Nightly can also install unsigned add-ons if you set `xpinstall.signatures.required` to `false` in `about:config`.

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
