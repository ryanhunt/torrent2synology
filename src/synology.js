// Minimal Synology Download Station client (DSM Auth v6 + DownloadStation Task v1).

async function call(base, path, params, body, sid) {
  const url = new URL(`${base}/webapi/${path}`);
  let init = {};
  if (body) {
    if (sid) url.searchParams.set("_sid", sid); // multipart uploads: DSM also wants the session in the URL
    init = { method: "POST", body };
  } else {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  let res;
  try {
    res = await fetch(url, { ...init, credentials: "omit" });
  } catch (e) {
    throw new Error(`Cannot reach ${url.origin} (${e.message}). Check the address, certificate and site access.`);
  }
  const json = await res.json();
  if (!json.success) {
    const code = json.error?.code;
    const e = new Error(`Synology API error ${code ?? "?"}${API_ERRORS[code] ? `: ${API_ERRORS[code]}` : ""} (${path})`);
    e.code = json.error?.code;
    throw e;
  }
  return json.data;
}

const API_ERRORS = {
  101: "invalid parameter",
  102: "API does not exist",
  103: "method does not exist",
  104: "version not supported",
  105: "permission denied for this account",
  106: "session timed out",
};

const LOGIN_ERRORS = {
  400: "Invalid username or password",
  401: "Account disabled",
  402: "Permission denied",
  403: "2-step verification required: open the extension settings, enter a current code and click Test connection",
  404: "2-step verification code rejected",
};

// With 2FA: pass cfg.otp once; DSM then returns a device id (did) that is sent as
// device_id on later logins so no further codes are needed.
async function loginFull(cfg) {
  const params = {
    api: "SYNO.API.Auth",
    version: "6",
    method: "login",
    account: cfg.username,
    passwd: cfg.password,
    session: "DownloadStation",
    format: "sid",
  };
  if (cfg.otp) {
    params.otp_code = cfg.otp;
    params.enable_device_token = "yes";
    params.device_name = "Torrent2Synology";
  } else if (cfg.deviceId) {
    params.device_id = cfg.deviceId;
    params.device_name = "Torrent2Synology";
  }
  try {
    return await call(cfg.url, "auth.cgi", params);
  } catch (e) {
    if (LOGIN_ERRORS[e.code]) e.message = LOGIN_ERRORS[e.code];
    throw e;
  }
}

export async function login(cfg) {
  return (await loginFull(cfg)).sid;
}

export async function logout(cfg, sid) {
  await call(cfg.url, "auth.cgi", {
    api: "SYNO.API.Auth", version: "1", method: "logout", session: "DownloadStation", _sid: sid,
  }).catch(() => {});
}

function taskForm(destination, sid) {
  const form = new FormData();
  form.set("api", "SYNO.DownloadStation.Task");
  form.set("version", "1");
  form.set("method", "create");
  // Path is relative to the share root, e.g. "video/TV Shows" (no leading slash).
  if (destination) form.set("destination", destination.replace(/^\/+|\/+$/g, ""));
  form.set("_sid", sid);
  return form;
}

/** Add a magnet link or http(s) URL to a .torrent. */
export async function addUri(cfg, uri, destination) {
  const sid = await login(cfg);
  try {
    const form = taskForm(destination, sid);
    form.set("uri", uri);
    await call(cfg.url, "DownloadStation/task.cgi", null, form, sid);
  } finally {
    await logout(cfg, sid);
  }
}

/** Upload a .torrent file's bytes. */
export async function addFile(cfg, blob, filename, destination) {
  const sid = await login(cfg);
  try {
    try {
      const form = taskForm(destination, sid);
      form.set("file", blob, filename); // file field must be last for DSM
      await call(cfg.url, "DownloadStation/task.cgi", null, form, sid);
    } catch (e) {
      // DSM 7 rejects the v1 upload for some setups; retry with the call DSM's own web UI uses.
      if (![101, 102, 103, 104].includes(e.code)) throw e;
      await addFileV2(cfg, sid, blob, filename, destination);
    }
  } finally {
    await logout(cfg, sid);
  }
}

async function addFileV2(cfg, sid, blob, filename, destination) {
  const form = new FormData();
  form.set("api", "SYNO.DownloadStation2.Task");
  form.set("version", "2");
  form.set("method", "create");
  form.set("type", JSON.stringify("file"));
  form.set("file", JSON.stringify(["torrent"]));
  form.set("create_list", "false");
  if (destination) form.set("destination", JSON.stringify(destination.replace(/^\/+|\/+$/g, "")));
  form.set("torrent", blob, filename);
  await call(cfg.url, "entry.cgi", null, form, sid);
}

/** Returns the trusted-device id when a 2FA code was used, else undefined. */
export async function testConnection(cfg) {
  const { sid, did } = await loginFull(cfg);
  await logout(cfg, sid);
  return did;
}
