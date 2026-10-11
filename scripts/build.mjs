// Zips src/ for store upload: dist/torrent2synology.zip
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

mkdirSync("dist", { recursive: true });
rmSync("dist/torrent2synology.zip", { force: true });
execFileSync("zip", ["-r", "../dist/torrent2synology.zip", ".", "-x", ".DS_Store"], { cwd: "src", stdio: "inherit" });
