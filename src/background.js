import { addUri, addFile } from "./synology.js";
import { getConfig } from "./config.js";

const api = globalThis.browser ?? globalThis.chrome;
const MENU_PREFIX = "send-to-synology:";
const PARENT_ID = "send-to-synology";
function notify(title, message) {
  api.notifications.create({
    type: "basic", iconUrl: api.runtime.getURL("icons/icon-128.png"), title, message,
  });
}

const isMagnet = (u) => /^magnet:/i.test(u);
const isTorrentUrl = (u) => /torrent/i.test(u.replace(/^[a-z]+:\/\/[^/]*/i, ""));

// destIndex null = left-click send, which uses the dedicated left-click folder.
async function send(link, destIndex = 0) {
  const cfg = await getConfig();
  if (!cfg.url || !cfg.username) {
    api.runtime.openOptionsPage();
    return notify("Torrent2Synology", "Configure your NAS connection first.");
  }
  if (cfg.locked) {
    api.runtime.openOptionsPage();
    return notify("Torrent2Synology", "Locked: enter your passphrase in the settings to unlock.");
  }
  const dest = destIndex === null
    ? { name: "default folder", folder: cfg.leftClickFolder }
    : cfg.destinations[destIndex] ?? cfg.destinations[0];
  const folder = dest?.folder ?? "";
  try {
    if (isMagnet(link) || !isTorrentUrl(link)) {
      // Magnets, and plain links, which Download Station can fetch itself.
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
        console.warn("Fetching the torrent failed, asking the NAS to fetch it:", fetchErr);
        await addUri(cfg, link, folder);
      }
    }
    const where = dest ? ` → ${dest.name}` : "";
    notify(`Sent to Synology${where}`, link.length > 100 ? `${link.slice(0, 100)}…` : link);
  } catch (e) {
    console.error("Send failed", e);
    notify("Failed to send to Synology", e.message);
  }
}

// One item when there is a single destination, otherwise a submenu with one item each.
async function buildMenu() {
  const { destinations } = await getConfig();
  await api.contextMenus.removeAll();
  // No targetUrlPatterns: Chrome can't match magnet: links, so the menu shows on every link.
  const base = { contexts: ["link"] };
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
  if (msg?.type === "send" && typeof msg.link === "string") send(msg.link, null);
});

api.action.onClicked.addListener(() => api.runtime.openOptionsPage());
