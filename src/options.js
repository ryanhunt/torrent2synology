import { testConnection } from "./synology.js";

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const fields = ["url", "username", "password", "destination"];

const status = (msg, err) => { $("status").textContent = msg; $("status").style.color = err ? "crimson" : "green"; };

function read() {
  const cfg = Object.fromEntries(fields.map((f) => [f, $(f).value.trim()]));
  cfg.url = cfg.url.replace(/\/+$/, "");
  cfg.interceptClicks = $("interceptClicks").checked;
  return cfg;
}

// The NAS is an arbitrary origin, so request host access at runtime.
async function ensureHostAccess(url) {
  const origin = `${new URL(url).origin}/*`;
  return api.permissions.request({ origins: [origin] });
}

api.storage.local.get({ url: "", username: "", password: "", destination: "", interceptClicks: false }).then((cfg) => {
  fields.forEach((f) => { $(f).value = cfg[f]; });
  $("interceptClicks").checked = cfg.interceptClicks;
});

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cfg = read();
  if (!(await ensureHostAccess(cfg.url))) return status("Host permission denied.", true);
  await api.storage.local.set(cfg);
  status("Saved.");
});

$("test").addEventListener("click", async () => {
  const cfg = read();
  try {
    if (!(await ensureHostAccess(cfg.url))) return status("Host permission denied.", true);
    await testConnection(cfg);
    status("Connection OK.");
  } catch (e) {
    status(`Failed: ${e.message}`, true);
  }
});
