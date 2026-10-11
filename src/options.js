import { testConnection } from "./synology.js";
import { getConfig } from "./config.js";
import { encryptSecret, decryptSecret } from "./crypto.js";

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const fields = ["url", "username", "leftClickFolder"];

const status = (msg, err) => { $("status").textContent = msg; $("status").style.color = err ? "crimson" : "green"; };

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

// The NAS is an arbitrary origin, so request host access at runtime.
async function ensureHostAccess(url) {
  const origin = `${new URL(url).origin}/*`;
  return api.permissions.request({ origins: [origin] });
}

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
  row.className = "dest";
  const name = Object.assign(document.createElement("input"), { type: "text", placeholder: "Label, e.g. Movies", value: d.name });
  const folder = Object.assign(document.createElement("input"), { type: "text", placeholder: "Folder, e.g. video/Movies", value: d.folder });
  const remove = Object.assign(document.createElement("button"), { type: "button", textContent: "✕", title: "Remove" });
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
});

$("add").addEventListener("click", () => addRow());

$("protect").addEventListener("change", refreshProtectUI);

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

$("forgot").addEventListener("click", async () => {
  if (!confirm("This permanently deletes the saved (encrypted) password. Your other settings are kept. Continue?")) return;
  await api.storage.local.remove(["password", "encrypted"]);
  await api.storage.local.set({ passwordProtected: false });
  await api.storage.session.remove("password");
  isProtected = false;
  $("protect").checked = false;
  $("password").value = "";
  $("passphrase").value = "";
  refreshProtectUI();
  status("Saved password deleted. Enter the password again and click Save.");
});

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cfg = read();
  if (!(await ensureHostAccess(cfg.url))) return status("Host permission denied.", true);
  const pwd = await currentPassword();
  if (!pwd) return status(isProtected ? "Unlock first, or enter the password." : "Enter the password.", true);
  const { otp, ...stored } = cfg;

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
  status("Saved.");
});

$("test").addEventListener("click", async () => {
  const cfg = read();
  try {
    cfg.password = await currentPassword();
    if (!cfg.password) return status(isProtected ? "Unlock first, or enter the password." : "Enter the password.", true);
    if (!(await ensureHostAccess(cfg.url))) return status("Host permission denied.", true);
    const did = await testConnection(cfg);
    if (did) {
      deviceId = did;
      await api.storage.local.set({ deviceId });
      $("otp").value = "";
      $("device").textContent = "This browser is now a trusted device; no code needed.";
    }
    status("Connection OK.");
  } catch (e) {
    status(`Failed: ${e.message}`, true);
  }
});
