import { testConnection } from "./synology.js";
import { getConfig } from "./config.js";

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const fields = ["url", "username", "password"];

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
  cfg.destinations.forEach(addRow);
  deviceId = cfg.deviceId;
  if (deviceId) $("device").textContent = "This browser is a trusted device; no code needed.";
  $("interceptClicks").checked = cfg.interceptClicks;
});

$("add").addEventListener("click", () => addRow());

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cfg = read();
  if (!(await ensureHostAccess(cfg.url))) return status("Host permission denied.", true);
  const { otp, ...stored } = cfg;
  await api.storage.local.set(stored);
  status("Saved.");
});

$("test").addEventListener("click", async () => {
  const cfg = read();
  try {
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
