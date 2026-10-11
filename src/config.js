// Shared settings access. Each destination maps a label (shown in the right-click menu)
// to a folder on the NAS; the first one is the default used for left-click sends.
const api = globalThis.browser ?? globalThis.chrome;

export const DEFAULTS = {
  url: "", username: "", password: "", interceptClicks: false, deviceId: "",
  destinations: [{ name: "TV Shows", folder: "" }, { name: "Movies", folder: "" }],
  destination: "", // legacy single folder, migrated below
};

export async function getConfig() {
  const cfg = await api.storage.local.get(DEFAULTS);
  cfg.url = cfg.url.replace(/\/+$/, "");
  if (cfg.destination) {
    // Migrate the old single-folder setting.
    cfg.destinations = [{ name: "Default", folder: cfg.destination }, ...cfg.destinations.filter((d) => d.folder)];
    api.storage.local.set({ destinations: cfg.destinations });
    api.storage.local.remove("destination");
    cfg.destination = "";
  }
  return cfg;
}
