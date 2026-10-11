// Minimal Synology Download Station client (DSM Auth v6 + DownloadStation Task v1).

async function call(base, path, params, body) {
  const url = new URL(`${base}/webapi/${path}`);
  let init = {};
  if (body) {
    init = { method: "POST", body };
  } else {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url, { ...init, credentials: "omit" });
  const json = await res.json();
  if (!json.success) {
    const e = new Error(`Synology API error ${json.error?.code ?? "?"} (${path})`);
    e.code = json.error?.code;
    throw e;
  }
  return json.data;
}

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

function taskForm(cfg, sid) {
  const form = new FormData();
  form.set("api", "SYNO.DownloadStation.Task");
  form.set("version", "1");
  form.set("method", "create");
  if (cfg.destination) form.set("destination", cfg.destination);
  form.set("_sid", sid);
  return form;
}

/** Add a magnet link or http(s) URL to a .torrent. */
export async function addUri(cfg, uri) {
  const sid = await login(cfg);
  try {
    const form = taskForm(cfg, sid);
    form.set("uri", uri);
    await call(cfg.url, "DownloadStation/task.cgi", null, form);
  } finally {
    await logout(cfg, sid);
  }
}

/** Upload a .torrent file's bytes. */
export async function addFile(cfg, blob, filename) {
  const sid = await login(cfg);
  try {
    const form = taskForm(cfg, sid);
    form.set("file", blob, filename); // file field must be last for DSM
    await call(cfg.url, "DownloadStation/task.cgi", null, form);
  } finally {
    await logout(cfg, sid);
  }
}

/** Returns the trusted-device id when a 2FA code was used, else undefined. */
export async function testConnection(cfg) {
  const { sid, did } = await loginFull(cfg);
  await logout(cfg, sid);
  return did;
}
