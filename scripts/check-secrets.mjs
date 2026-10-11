// Blocks credentials and the user'''s real hostnames from entering git history.
// Sample hostnames and ports (nas.local, 5001, ...) are fine in code and docs.
// Real values go in .git/secret-blocklist (one term per line, case-insensitive, never committed)
// or the T2S_BLOCKLIST env var (comma-separated).
// Usage:
//   node scripts/check-secrets.mjs staged            scan the index (pre-commit)
//   node scripts/check-secrets.mjs message <file>    scan a commit message (commit-msg)
//   node scripts/check-secrets.mjs push              scan commits about to be pushed (pre-push; reads hook stdin)
//   node scripts/check-secrets.mjs range <revs...>   scan commits from `git rev-list <revs...>` (CI)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const BLOCKED_FILES = [
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)[^/]*\.local(\.[a-z]+)?$/i,
  /(^|\/)(config|settings|credentials|secrets?)\.(local|private)\.[a-z]+$/i,
  /\.(pem|key|p12|pfx|ovpn)$/i,
];

const RULES = [
  ["literal credential", /\b(?:user(?:name)?|login|account|pass(?:word|wd)?|pwd|secret|token|api[_-]?key|host(?:name)?)\b["']?\s*[:=]\s*["'`][^"'`\s$][^"'`]*["'`]/i],
  ["env-style credential", /^\s*(?:export\s+)?\w*(?:user|login|pass|pwd|secret|token|host|port|addr)\w*=\S+/im],
  ["personal DDNS/QuickConnect hostname", /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:synology\.me|quickconnect\.to|diskstation\.me|i234\.me|myds\.me|duckdns\.org|no-ip\.(?:org|com)|ddns\.net)\b/i],
  ["credentials in URL", /:\/\/[^\s/@:"']+:[^\s/@"']+@/],
  ["DSM session id", /\b_sid=[A-Za-z0-9_-]{8,}/],
];

const blocklist = [
  ...(process.env.T2S_BLOCKLIST ?? "").split(","),
  ...(() => {
    try {
      const f = git("rev-parse", "--git-path", "secret-blocklist").trim();
      return readFileSync(f, "utf8").split("\n");
    } catch {
      return [];
    }
  })(),
].map((t) => t.trim().toLowerCase()).filter((t) => t && !t.startsWith("#"));

if (!blocklist.length) {
  console.error("note: no personal blocklist configured (.git/secret-blocklist); only generic patterns are checked.");
}

function scanText(label, text) {
  const hits = [];
  const lower = text.toLowerCase();
  for (const term of blocklist) if (lower.includes(term)) hits.push(`${label}: contains blocklisted value "${term}"`);
  text.split("\n").forEach((line, i) => {
    for (const [name, re] of RULES) {
      const m = re.exec(line);
      if (m) hits.push(`${label}:${i + 1}: ${name}: ${m[0]}`);
    }
  });
  return hits;
}

// Generated lockfile: dependency names trip the credential rules and it holds no user data.
const SKIP_CONTENT = new Set(["package-lock.json"]);
const isBinary = (s) => s.includes("\0");

function scanPath(label, path) {
  return BLOCKED_FILES.some((re) => re.test(path)) ? [`${label}: blocked file name`] : [];
}

function scanStaged() {
  const files = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").split("\0").filter(Boolean);
  return files.flatMap((f) => {
    const blob = git("show", `:${f}`);
    return [...scanPath(f, f), ...(isBinary(blob) || SKIP_CONTENT.has(f) ? [] : scanText(f, blob))];
  });
}

function scanCommits(commits) {
  const hits = [];
  for (const c of commits) {
    const short = c.slice(0, 8);
    hits.push(...scanText(`${short} (message)`, git("show", "-s", "--format=%B%n%an <%ae>%n%cn <%ce>", c)));
    const files = git("diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "--diff-filter=ACMR", "-z", c)
      .split("\0").filter(Boolean);
    for (const f of files) {
      const label = `${short}:${f}`;
      hits.push(...scanPath(label, f));
      const blob = git("show", `${c}:${f}`);
      if (!SKIP_CONTENT.has(f) && !isBinary(blob)) hits.push(...scanText(label, blob));
    }
  }
  return hits;
}

const [mode, ...rest] = process.argv.slice(2);
let hits = [];
const ZERO = /^0+$/;

if (mode === "staged") {
  hits = scanStaged();
} else if (mode === "message") {
  hits = scanText("commit message", readFileSync(rest[0], "utf8").replace(/^#.*$/gm, ""));
} else if (mode === "push") {
  const commits = new Set();
  for (const line of readFileSync(0, "utf8").split("\n").filter(Boolean)) {
    const [, localSha, , remoteSha] = line.split(" ");
    if (ZERO.test(localSha)) continue; // deleting a ref
    const revs = ZERO.test(remoteSha) ? [localSha, "--not", "--remotes"] : [`${remoteSha}..${localSha}`];
    git("rev-list", ...revs).split("\n").filter(Boolean).forEach((c) => commits.add(c));
  }
  hits = scanCommits(commits);
} else if (mode === "range") {
  hits = scanCommits(git("rev-list", ...rest).split("\n").filter(Boolean));
} else {
  console.error("usage: check-secrets.mjs staged | message <file> | push | range <revs...>");
  process.exit(2);
}

if (hits.length) {
  console.error("\n✖ Blocked: possible credentials or personal hostnames detected:\n");
  hits.forEach((h) => console.error(`  ${h}`));
  console.error("\nRemove them (use sample values like \"nas.local\"). Real values belong only in the browser's extension storage.\n");
  process.exit(1);
}
