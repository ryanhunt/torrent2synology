// Optionally intercept left-clicks on magnet / .torrent links.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  let enabled = false;
  const refresh = () => api.storage.local.get({ interceptClicks: false }).then((c) => { enabled = c.interceptClicks; });
  refresh();
  api.storage.onChanged.addListener(refresh);

  document.addEventListener("click", (ev) => {
    if (!enabled || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target.closest?.("a[href]");
    if (!a) return;
    const href = a.href;
    let isTorrent = /^magnet:/i.test(href);
    try {
      const u = new URL(href);
      isTorrent ||= /^https?:$/.test(u.protocol) && /torrent/i.test(u.pathname + u.search);
    } catch {}
    if (isTorrent) {
      ev.preventDefault();
      ev.stopPropagation();
      api.runtime.sendMessage({ type: "send", link: href });
    }
  }, true);
})();
