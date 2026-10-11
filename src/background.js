import { addUri, addFile } from "./synology.js";
import { getConfig } from "./config.js";

const api = globalThis.browser ?? globalThis.chrome;
const MENU_PREFIX = "send-to-synology:";
const PARENT_ID = "send-to-synology";
// Match patterns can't be regexes: magnets, plus any http(s) URL with "torrent" in its path or query
// (covers /x.torrent and sites like /torrent/download/<hash>).
const LINK_PATTERNS = ["magnet:*", "*://*/*torrent*"];

function notify(title, message) {
  api.notifications.create({
    type: "basic", iconUrl: api.runtime.getURL("icons/icon.svg"), title, message,
  });
}

const isMagnet = (u) => /^magnet:/i.test(u);

async function send(link, destIndex = 0) {
  const cfg = await getConfig();
  if (!cfg.url || !cfg.username) {
    api.runtime.openOptionsPage();
    return notify("Torrent2Synology", "Configure your NAS connection first.");
  }
  const dest = cfg.destinations[destIndex] ?? cfg.destinations[0];
  const folder = dest?.folder ?? "";
  try {
    if (isMagnet(link)) {
      await addUri(cfg, link, folder);
    } else {
      // Fetch in the browser (keeps the user's cookies for private trackers),
      // then upload the bytes; fall back to letting the NAS fetch the URL.
      try {
        const res = await fetch(link, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const name = decodeURIComponent(new URL(link).pathname.split("/").pop()) || "download.torrent";
        await addFile(cfg, await res.blob(), name.endsWith(".torrent") ? name : `${name}.torrent`, folder);
      } catch (fetchErr) {
        if (fetchErr.code) throw fetchErr; // Synology error, don't retry
        await addUri(cfg, link, folder);
      }
    }
    const where = dest ? ` → ${dest.name}` : "";
    notify(`Sent to Synology${where}`, link.length > 100 ? `${link.slice(0, 100)}…` : link);
  } catch (e) {
    notify("Failed to send to Synology", e.message);
  }
}

// One item when there is a single destination, otherwise a submenu with one item each.
async function buildMenu() {
  const { destinations } = await getConfig();
  await api.contextMenus.removeAll();
  const base = { contexts: ["link"], targetUrlPatterns: LINK_PATTERNS };
  if (destinations.length <= 1) {
    api.contextMenus.create({ ...base, id: `${MENU_PREFIX}0`, title: "Send to Synology Download Station" });
    return;
  }
  api.contextMenus.create({ ...base, id: PARENT_ID, title: "Send to Synology Download Station" });
  destinations.forEach((d, i) => {
    api.contextMenus.create({ ...base, id: `${MENU_PREFIX}${i}`, parentId: PARENT_ID, title: d.name || `Destination ${i + 1}` });
  });
}

buildMenu(); // runs each time the background wakes, so the menu is always present
api.storage.onChanged.addListener((changes) => {
  if (changes.destinations) buildMenu();
});

api.contextMenus.onClicked.addListener((info) => {
  const id = String(info.menuItemId);
  if (id.startsWith(MENU_PREFIX) && info.linkUrl) send(info.linkUrl, Number(id.slice(MENU_PREFIX.length)));
});

api.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "send" && typeof msg.link === "string") send(msg.link);
});

api.action.onClicked.addListener(() => api.runtime.openOptionsPage());
