import { testConnection } from "./synology.js";

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const fields = ["url", "username", "password", "destination"];

const status = (msg, err) => { $("status").textContent = msg; $("status").style.color = err ? "crimson" : "green"; };

function read() {
  const cfg = Object.fromEntries(fields.map((f) => [f, $(f).value.trim()]));
  cfg.url = cfg.url.replace(/\/+$/, "");
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

api.storage.local.get({ url: "", username: "", password: "", destination: "", interceptClicks: false, deviceId: "" }).then((cfg) => {
  fields.forEach((f) => { $(f).value = cfg[f]; });
  deviceId = cfg.deviceId;
  if (deviceId) $("device").textContent = "This browser is a trusted device; no code needed.";
  $("interceptClicks").checked = cfg.interceptClicks;
});

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
