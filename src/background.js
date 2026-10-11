import { addUri, addFile } from "./synology.js";

const api = globalThis.browser ?? globalThis.chrome;
const MENU_ID = "send-to-synology";

async function getConfig() {
  const cfg = await api.storage.local.get({
    url: "", username: "", password: "", destination: "", interceptClicks: false,
  });
  cfg.url = cfg.url.replace(/\/+$/, "");
  return cfg;
}

function notify(title, message) {
  api.notifications.create({
    type: "basic", iconUrl: api.runtime.getURL("icons/icon.svg"), title, message,
  });
}

const isMagnet = (u) => /^magnet:/i.test(u);

async function send(link) {
  const cfg = await getConfig();
  if (!cfg.url || !cfg.username) {
    api.runtime.openOptionsPage();
    return notify("Torrent2Synology", "Configure your NAS connection first.");
  }
  try {
    if (isMagnet(link)) {
      await addUri(cfg, link);
    } else {
      // Fetch in the browser (keeps the user's cookies for private trackers),
      // then upload the bytes; fall back to letting the NAS fetch the URL.
      try {
        const res = await fetch(link, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const name = decodeURIComponent(new URL(link).pathname.split("/").pop()) || "download.torrent";
        await addFile(cfg, await res.blob(), name.endsWith(".torrent") ? name : `${name}.torrent`);
      } catch (fetchErr) {
        if (fetchErr.code) throw fetchErr; // Synology error, don't retry
        await addUri(cfg, link);
      }
    }
    notify("Sent to Synology", link.length > 100 ? `${link.slice(0, 100)}…` : link);
  } catch (e) {
    notify("Failed to send to Synology", e.message);
  }
}

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({
    id: MENU_ID,
    title: "Send to Synology Download Station",
    contexts: ["link"],
    targetUrlPatterns: ["magnet:*", "*://*/*.torrent", "*://*/*.torrent?*"],
  });
});

api.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID && info.linkUrl) send(info.linkUrl);
});

api.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "send" && typeof msg.link === "string") send(msg.link);
  if (msg?.type === "getInterceptSetting") return getConfig().then((c) => c.interceptClicks);
});

api.action.onClicked.addListener(() => api.runtime.openOptionsPage());
