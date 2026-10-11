import { testConnection } from "./synology.js";
import { getConfig } from "./config.js";
import { encryptSecret, decryptSecret } from "./crypto.js";

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const fields = ["url", "username", "leftClickFolder"];

document.documentElement.dataset.bsTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const status = (msg, err, info) => {
  const el = $("status");
  el.textContent = msg;
  el.className = `alert mb-0 ${info ? "alert-info" : err ? "alert-danger" : "alert-success"}`;
  el.hidden = false;
};

// Modifier keys that make a click skip capture, shown with the right names for the platform.
function showModifierHelp() {
  const mac = /mac/i.test(navigator.userAgentData?.platform ?? navigator.platform);
  const keys = mac ? ["⌘ Command", "⌥ Option", "⇧ Shift", "⌃ Control"] : ["Ctrl", "Alt", "Shift"];
  const help = $("modifierHelp");
  help.append("To open a link normally, hold ");
  keys.forEach((k, i) => {
    const kbd = document.createElement("kbd");
    kbd.textContent = k;
    help.append(kbd, i < keys.length - 2 ? ", " : i === keys.length - 2 ? " or " : "");
  });
  help.append(" while clicking.");
}
showModifierHelp();
$("version").textContent = api.runtime.getManifest().version;

const refreshLeftUI = () => { $("leftBox").hidden = !$("interceptClicks").checked; };

function read() {
  const cfg = Object.fromEntries(fields.map((f) => [f, $(f).value.trim()]));
  cfg.url = cfg.url.replace(/\/+$/, "");
  cfg.destinations = [...document.querySelectorAll(".dest")]
    .map((row) => ({ name: row.children[0].value.trim(), folder: row.children[1].value.trim() }))
    .filter((d) => d.name || d.folder)
    .map((d) => ({ name: d.name || d.folder, folder: d.folder }));
  cfg.interceptClicks = $("interceptClicks").checked;
  cfg.deviceId = deviceId;
  cfg.otp = $("otp").value.trim();
  return cfg;
}

const isHttps = (url) => /^https:\/\//i.test(url.trim());
const refreshHttpsWarn = () => { $("httpsWarn").hidden = !isHttps($("url").value); };

// Probes an https server. Chrome/Firefox don't expose certificates to extensions, but webRequest
// reports the network error (e.g. net::ERR_CERT_AUTHORITY_INVALID), which tells cert problems from
// an unreachable server. Returns null when fine, else an error message.
async function checkHttps(url) {
  const origin = new URL(url).origin;
  let netError = "";
  const onError = (d) => { netError = d.error; };
  api.webRequest.onErrorOccurred.addListener(onError, { urls: [`${origin}/*`] });
  try {
    const probe = `${origin}/webapi/entry.cgi?api=SYNO.API.Info&version=1&method=query&query=SYNO.API.Auth`;
    await fetch(probe, { credentials: "omit", signal: AbortSignal.timeout(8000) });
    return null;
  } catch {
    await new Promise((r) => setTimeout(r, 150)); // let the webRequest event arrive
    if (/CERT|SSL|PKIX|TLS/i.test(netError)) {
      return `The HTTPS certificate for ${origin} isn't trusted by your browser (likely self-signed; ${netError}), so the extension can't connect. Use the http:// address, or install a trusted certificate on the NAS.`;
    }
    return `Couldn't establish a secure connection to ${origin}${netError ? ` (${netError})` : ""}. Check the address and port; if it is correct, the certificate is probably untrusted.`;
  } finally {
    api.webRequest.onErrorOccurred.removeListener(onError);
  }
}

// The NAS is an arbitrary origin, so request host access at runtime.
async function ensureHostAccess(url) {
  const origin = `${new URL(url).origin}/*`;
  return api.permissions.request({ origins: [origin] });
}

// Full check: host access, HTTPS certificate, a real DSM login (using the 2FA code if one is
// entered), then that each download folder exists. Returns { problem } on failure, else { note }
// (an optional caveat). A successful 2FA login also stores the trusted-device token.
async function verifyConnection(cfg, pwd) {
  try {
    if (!(await ensureHostAccess(cfg.url))) return { problem: "Host permission denied." };
    if (isHttps(cfg.url)) {
      const problem = await checkHttps(cfg.url);
      if (problem) return { problem };
    }
    const folders = [...new Set([
      ...cfg.destinations.map((d) => d.folder),
      ...(cfg.interceptClicks ? [cfg.leftClickFolder] : []),
    ].filter(Boolean))];
    const { did, missing, unverified } = await testConnection({ ...cfg, password: pwd }, folders);
    if (did) {
      deviceId = did;
      await api.storage.local.set({ deviceId });
      $("otp").value = "";
      $("device").textContent = "This browser is now a trusted device; no code needed.";
    }
    if (missing.length) {
      return { problem: `These folders don't exist on the NAS: ${missing.join(", ")}. Paths are relative to the share root, e.g. video/Movies.` };
    }
    return { note: unverified ? " Folders couldn't be verified (the account needs File Station permission for that)." : "" };
  } catch (e) {
    return { problem: `Connection failed: ${e.message}` };
  }
}

const setBusy = (busy) => document.querySelectorAll("#form button").forEach((b) => { b.disabled = busy; });

let deviceId = "";
let isProtected = false; // password currently stored encrypted

const sessionPassword = async () => (await api.storage.session.get({ password: "" })).password;
// The typed password, else the unlocked one (when the field is empty because it is stored encrypted).
const currentPassword = async () => $("password").value || (isProtected ? sessionPassword() : "");

async function refreshProtectUI() {
  $("protectBox").hidden = !$("protect").checked;
  $("unlock").hidden = $("lock").hidden = $("forgot").hidden = !isProtected;
  $("password").placeholder = isProtected ? "Stored encrypted" : "";
  $("lockstatus").textContent = !isProtected
    ? "Enter a passphrase and click Save. You will unlock once per browser session; the password is kept in memory only while unlocked."
    : (await sessionPassword())
      ? "Unlocked for this browser session."
      : "Locked. Enter your passphrase and click Unlock.";
}

function addRow(d = { name: "", folder: "" }) {
  const row = document.createElement("div");
  row.className = "dest input-group mb-2";
  const name = Object.assign(document.createElement("input"), { type: "text", className: "form-control", placeholder: "Label, e.g. Movies", value: d.name });
  const folder = Object.assign(document.createElement("input"), { type: "text", className: "form-control", placeholder: "Folder, e.g. video/Movies", value: d.folder });
  const remove = Object.assign(document.createElement("button"), { type: "button", className: "btn btn-outline-secondary", textContent: "✕", title: "Remove" });
  remove.addEventListener("click", () => row.remove());
  row.append(name, folder, remove);
  $("destinations").append(row);
}

getConfig().then((cfg) => {
  fields.forEach((f) => { $(f).value = cfg[f]; });
  isProtected = cfg.passwordProtected;
  $("password").value = isProtected ? "" : cfg.password;
  $("protect").checked = isProtected;
  refreshProtectUI();
  cfg.destinations.forEach(addRow);
  deviceId = cfg.deviceId;
  if (deviceId) $("device").textContent = "This browser is a trusted device; no code needed.";
  $("interceptClicks").checked = cfg.interceptClicks;
  refreshLeftUI();
  refreshHttpsWarn();
});

$("add").addEventListener("click", () => addRow());

$("interceptClicks").addEventListener("change", refreshLeftUI);
$("url").addEventListener("input", refreshHttpsWarn);

$("unlock").addEventListener("click", async () => {
  try {
    const { encrypted } = await api.storage.local.get({ encrypted: null });
    const pwd = await decryptSecret($("passphrase").value, encrypted);
    await api.storage.session.set({ password: pwd });
    $("passphrase").value = "";
    status("Unlocked.");
  } catch (e) {
    status(e.message, true);
  }
  refreshProtectUI();
});

$("lock").addEventListener("click", async () => {
  await api.storage.session.remove("password");
  status("Locked.");
  refreshProtectUI();
});

// Deletes the encrypted password (and the unlocked copy); other settings are kept.
async function clearStoredPassword(message) {
  await api.storage.local.remove(["password", "encrypted"]);
  await api.storage.local.set({ passwordProtected: false });
  await api.storage.session.remove("password");
  isProtected = false;
  $("protect").checked = false;
  $("password").value = "";
  $("passphrase").value = "";
  refreshProtectUI();
  status(message);
}

const CONFIRM_CLEAR = "This permanently deletes the stored (encrypted) password. Your other settings are kept. Continue?";
const CLEARED = "Stored password cleared. Enter the password again and click Save.";

$("forgot").addEventListener("click", async () => {
  if (confirm(CONFIRM_CLEAR)) await clearStoredPassword(CLEARED);
});

// Turning encryption off while a password is stored encrypted clears it, like the button.
$("protect").addEventListener("change", async () => {
  if ($("protect").checked || !isProtected) return refreshProtectUI();
  if (confirm(CONFIRM_CLEAR)) await clearStoredPassword(CLEARED);
  else $("protect").checked = true;
  refreshProtectUI();
});

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cfg = read();
  const pwd = await currentPassword();
  if (!pwd) return status(isProtected ? "Unlock first, or enter the password." : "Enter the password.", true);
  // Settings are only saved if they actually connect.
  status("Checking connection…", false, true);
  setBusy(true);
  const { problem, note } = await verifyConnection(cfg, pwd);
  setBusy(false);
  if (problem) return status(`Not saved. ${problem}`, true);
  const { otp, ...stored } = cfg;
  stored.deviceId = deviceId; // may have just been issued by the 2FA login

  if ($("protect").checked) {
    const phrase = $("passphrase").value;
    const reencrypt = !isProtected || $("password").value;
    if (reencrypt && !phrase) return status("Enter a passphrase to encrypt the password.", true);
    if (phrase && reencrypt) {
      stored.encrypted = await encryptSecret(phrase, pwd);
    }
    stored.passwordProtected = true;
    await api.storage.local.set(stored);
    await api.storage.local.remove("password");
    await api.storage.session.set({ password: pwd });
    isProtected = true;
    $("password").value = "";
    $("passphrase").value = "";
  } else {
    stored.passwordProtected = false;
    stored.password = pwd;
    stored.encrypted = null;
    await api.storage.local.set(stored);
    await api.storage.session.remove("password");
    isProtected = false;
  }
  refreshProtectUI();
  status(`Saved.${note}`);
});

$("test").addEventListener("click", async () => {
  const cfg = read();
  const pwd = await currentPassword();
  if (!pwd) return status(isProtected ? "Unlock first, or enter the password." : "Enter the password.", true);
  status("Checking connection…", false, true);
  setBusy(true);
  const { problem, note } = await verifyConnection(cfg, pwd);
  setBusy(false);
  status(problem ?? `Connection OK.${note}`, !!problem);
});
