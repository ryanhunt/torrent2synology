// Builds one zip per browser into dist/, each with a tailored manifest:
//   dist/torrent2synology-chrome-<version>.zip
//   dist/torrent2synology-firefox-<version>.zip
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const base = JSON.parse(readFileSync("src/manifest.json", "utf8"));
const { version } = base;

const targets = {
  chrome: (m) => {
    delete m.browser_specific_settings;
    m.background = { service_worker: "background.js", type: "module" };
  },
  firefox: (m) => {
    m.background = { scripts: ["background.js"], type: "module" };
  },
};

mkdirSync("dist", { recursive: true });
for (const [name, tailor] of Object.entries(targets)) {
  const stage = `dist/${name}`;
  const zip = `torrent2synology-${name}-${version}.zip`;
  rmSync(stage, { recursive: true, force: true });
  rmSync(`dist/${zip}`, { force: true });
  cpSync("src", stage, { recursive: true, filter: (p) => !p.endsWith(".DS_Store") });
  const manifest = structuredClone(base);
  tailor(manifest);
  writeFileSync(`${stage}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  execFileSync("zip", ["-r", "-X", `../${zip}`, "."], { cwd: stage, stdio: "ignore" });
  console.log(`built dist/${zip}`);
}
