import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(ROOT, "scripts/t3-sync.sh");

function run(args, env = {}, cwd = ROOT) {
  return spawnSync("bash", [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", "user.email=t3-sync@test", "-c", "user.name=t3-sync", ...args], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

describe("t3-sync.sh", () => {
  it("prints usage on bad args and does not merge", () => {
    const home = mkdtempSync(join(tmpdir(), "t3-sync-home-"));
    const result = run(["--nope"], { T3_SYNC_HOME: home, T3_SYNC_SKILL_HOME: home });
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /Usage:/);
  });

  it("check reports behind/ahead in a temp fork without touching userdata", () => {
    const home = mkdtempSync(join(tmpdir(), "t3-sync-home-"));
    const upstream = mkdtempSync(join(tmpdir(), "t3-sync-up-"));
    const fork = mkdtempSync(join(tmpdir(), "t3-sync-fork-"));

    git(upstream, "init", "-b", "main");
    writeFileSync(join(upstream, "README"), "upstream-1\n");
    git(upstream, "add", "README");
    git(upstream, "commit", "-m", "init");

    git(fork, "clone", upstream, ".");
    mkdirSync(join(fork, "lp"), { recursive: true });
    mkdirSync(join(fork, "scripts"), { recursive: true });
    writeFileSync(join(fork, "lp", "keep.txt"), "overlay\n");
    writeFileSync(join(fork, "lp", "overlays.manifest"), "lp\n");
    writeFileSync(join(fork, "scripts", "t3-sync.sh"), readFileSync(SCRIPT));
    spawnSync("chmod", ["+x", join(fork, "scripts", "t3-sync.sh")]);

    writeFileSync(join(upstream, "README"), "upstream-2\n");
    git(upstream, "add", "README");
    git(upstream, "commit", "-m", "second");

    const check = spawnSync("bash", [join(fork, "scripts", "t3-sync.sh"), "--check"], {
      cwd: fork,
      encoding: "utf8",
      env: {
        ...process.env,
        T3_SYNC_HOME: home,
        T3_SYNC_SKILL_HOME: home,
        T3_SYNC_UPSTREAM_REMOTE: "origin",
        T3_SYNC_UPSTREAM_REF: "main",
        T3_SYNC_RELEASE_API: "http://127.0.0.1:1/releases/latest",
      },
    });
    assert.equal(check.status, 0, check.stdout + check.stderr);
    assert.match(check.stdout, /behind\s+1 commit/);
    assert.match(check.stdout, /latest release: unavailable/);
    assert.equal(existsSync(join(home, "userdata")), false);
  });

  it("apply snapshots, merges, restores overlays, and rollback returns the snapshot", () => {
    const home = mkdtempSync(join(tmpdir(), "t3-sync-home-"));
    const upstream = mkdtempSync(join(tmpdir(), "t3-sync-up-"));
    const fork = mkdtempSync(join(tmpdir(), "t3-sync-fork-"));

    git(upstream, "init", "-b", "main");
    writeFileSync(join(upstream, "README"), "upstream-1\n");
    git(upstream, "add", "README");
    git(upstream, "commit", "-m", "init");

    git(fork, "clone", upstream, ".");
    mkdirSync(join(fork, "lp"), { recursive: true });
    mkdirSync(join(fork, "scripts"), { recursive: true });
    writeFileSync(join(fork, "lp", "keep.txt"), "overlay-before\n");
    writeFileSync(join(fork, "lp", "overlays.manifest"), "lp\n");
    writeFileSync(join(fork, "scripts", "t3-sync.sh"), readFileSync(SCRIPT));
    spawnSync("chmod", ["+x", join(fork, "scripts", "t3-sync.sh")]);
    git(fork, "add", "lp", "scripts");
    git(fork, "commit", "-m", "fork overlay");

    writeFileSync(join(upstream, "README"), "upstream-2\n");
    git(upstream, "add", "README");
    git(upstream, "commit", "-m", "second");

    const apply = spawnSync("bash", [join(fork, "scripts", "t3-sync.sh"), "--apply"], {
      cwd: fork,
      encoding: "utf8",
      env: {
        ...process.env,
        T3_SYNC_HOME: home,
        T3_SYNC_SKILL_HOME: home,
        T3_SYNC_UPSTREAM_REMOTE: "origin",
        T3_SYNC_UPSTREAM_REF: "main",
        T3_SYNC_KEEP: "8",
      },
    });
    assert.equal(apply.status, 0, apply.stdout + apply.stderr);
    assert.equal(readFileSync(join(fork, "README"), "utf8"), "upstream-2\n");
    assert.equal(readFileSync(join(fork, "lp", "keep.txt"), "utf8"), "overlay-before\n");
    assert.equal(existsSync(join(home, "bench")), true);

    const rollback = spawnSync("bash", [join(fork, "scripts", "t3-sync.sh"), "--rollback"], {
      cwd: fork,
      encoding: "utf8",
      env: {
        ...process.env,
        T3_SYNC_HOME: home,
        T3_SYNC_SKILL_HOME: home,
        T3_SYNC_UPSTREAM_REMOTE: "origin",
      },
    });
    assert.equal(rollback.status, 0, rollback.stdout + rollback.stderr);
    assert.equal(readFileSync(join(fork, "README"), "utf8"), "upstream-1\n");
    assert.equal(readFileSync(join(fork, "lp", "keep.txt"), "utf8"), "overlay-before\n");
  });

  it("refuses --apply on a dirty worktree", () => {
    const home = mkdtempSync(join(tmpdir(), "t3-sync-home-"));
    const fork = mkdtempSync(join(tmpdir(), "t3-sync-fork-"));
    git(fork, "init", "-b", "main");
    writeFileSync(join(fork, "README"), "x\n");
    git(fork, "add", "README");
    git(fork, "commit", "-m", "init");
    mkdirSync(join(fork, "scripts"), { recursive: true });
    writeFileSync(join(fork, "scripts", "t3-sync.sh"), readFileSync(SCRIPT));
    spawnSync("chmod", ["+x", join(fork, "scripts", "t3-sync.sh")]);
    writeFileSync(join(fork, "dirty.txt"), "nope\n");
    const apply = spawnSync("bash", [join(fork, "scripts", "t3-sync.sh"), "--apply"], {
      cwd: fork,
      encoding: "utf8",
      env: {
        ...process.env,
        T3_SYNC_HOME: home,
        T3_SYNC_SKILL_HOME: home,
        T3_SYNC_UPSTREAM_REMOTE: "origin",
        T3_SYNC_FETCH_ATTEMPTS: "1",
        T3_SYNC_FETCH_DELAY: "0",
      },
    });
    assert.equal(apply.status, 1);
    assert.match(apply.stdout + apply.stderr, /worktree is dirty/);
  });

  it("exits 2 on network failure without merging", () => {
    const home = mkdtempSync(join(tmpdir(), "t3-sync-home-"));
    const fork = mkdtempSync(join(tmpdir(), "t3-sync-fork-"));
    git(fork, "init", "-b", "main");
    writeFileSync(join(fork, "README"), "local\n");
    git(fork, "add", "README");
    git(fork, "commit", "-m", "init");
    git(fork, "remote", "add", "origin", join(tmpdir(), "no-such-upstream.git"));
    mkdirSync(join(fork, "scripts"), { recursive: true });
    writeFileSync(join(fork, "scripts", "t3-sync.sh"), readFileSync(SCRIPT));
    spawnSync("chmod", ["+x", join(fork, "scripts", "t3-sync.sh")]);
    const check = spawnSync("bash", [join(fork, "scripts", "t3-sync.sh"), "--check"], {
      cwd: fork,
      encoding: "utf8",
      env: {
        ...process.env,
        T3_SYNC_HOME: home,
        T3_SYNC_SKILL_HOME: home,
        T3_SYNC_UPSTREAM_REMOTE: "origin",
        T3_SYNC_FETCH_ATTEMPTS: "1",
        T3_SYNC_FETCH_DELAY: "0",
        T3_SYNC_RELEASE_API: "http://127.0.0.1:1/nope",
      },
    });
    assert.equal(check.status, 2, check.stdout + check.stderr);
    assert.match(check.stdout + check.stderr, /Nothing was merged/);
    assert.equal(readFileSync(join(fork, "README"), "utf8"), "local\n");
  });

  it("merges skills without wiping extra LP files and refuses ~/.t3 userdata", () => {
    const home = mkdtempSync(join(tmpdir(), "t3-sync-home-"));
    const fakeHome = mkdtempSync(join(tmpdir(), "t3-sync-user-"));
    const fork = mkdtempSync(join(tmpdir(), "t3-sync-fork-"));
    git(fork, "init", "-b", "main");
    writeFileSync(join(fork, "README"), "x\n");
    mkdirSync(join(fork, ".agents/skills/bench"), { recursive: true });
    mkdirSync(join(fork, "scripts"), { recursive: true });
    writeFileSync(join(fork, ".agents/skills/bench/SKILL.md"), "from-repo\n");
    mkdirSync(join(fork, ".claude/commands"), { recursive: true });
    writeFileSync(join(fork, ".claude/commands/bench.md"), "slash-from-repo\n");
    writeFileSync(join(fork, "scripts", "t3-sync.sh"), readFileSync(SCRIPT));
    spawnSync("chmod", ["+x", join(fork, "scripts", "t3-sync.sh")]);
    git(fork, "add", ".");
    git(fork, "commit", "-m", "skills");

    const dest = join(home, ".agents/skills/bench");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "custom-lp.md"), "keep-me\n");
    const install = spawnSync("bash", [join(fork, "scripts", "t3-sync.sh"), "--install-skills"], {
      cwd: fork,
      encoding: "utf8",
      env: {
        ...process.env,
        T3_SYNC_HOME: home,
        T3_SYNC_SKILL_HOME: home,
      },
    });
    assert.equal(install.status, 0, install.stdout + install.stderr);
    assert.equal(readFileSync(join(dest, "custom-lp.md"), "utf8"), "keep-me\n");
    assert.equal(readFileSync(join(dest, "SKILL.md"), "utf8"), "from-repo\n");
    const commandDest = join(home, ".claude/commands");
    mkdirSync(commandDest, { recursive: true });
    writeFileSync(join(commandDest, "keep-me.md"), "stay\n");
    const installAgain = spawnSync("bash", [join(fork, "scripts", "t3-sync.sh"), "--install-skills"], {
      cwd: fork,
      encoding: "utf8",
      env: {
        ...process.env,
        T3_SYNC_HOME: home,
        T3_SYNC_SKILL_HOME: home,
      },
    });
    assert.equal(installAgain.status, 0, installAgain.stdout + installAgain.stderr);
    assert.equal(readFileSync(join(commandDest, "bench.md"), "utf8"), "slash-from-repo\n");
    assert.equal(readFileSync(join(commandDest, "keep-me.md"), "utf8"), "stay\n");
    assert.equal(existsSync(join(home, ".codex/skills/bench/SKILL.md")), true);

    mkdirSync(join(fakeHome, ".t3/userdata"), { recursive: true });
    const blocked = spawnSync("bash", [join(fork, "scripts", "t3-sync.sh"), "--check"], {
      cwd: fork,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: fakeHome,
        T3_SYNC_HOME: join(fakeHome, ".t3/userdata"),
        T3_SYNC_SKILL_HOME: fakeHome,
        T3_SYNC_FETCH_ATTEMPTS: "1",
        T3_SYNC_FETCH_DELAY: "0",
      },
    });
    assert.equal(blocked.status, 1);
    assert.match(blocked.stdout + blocked.stderr, /never writes/);
  });

  it("keeps only T3_SYNC_KEEP snapshots", () => {
    const home = mkdtempSync(join(tmpdir(), "t3-sync-home-"));
    const upstream = mkdtempSync(join(tmpdir(), "t3-sync-up-"));
    const fork = mkdtempSync(join(tmpdir(), "t3-sync-fork-"));

    git(upstream, "init", "-b", "main");
    writeFileSync(join(upstream, "README"), "u1\n");
    git(upstream, "add", "README");
    git(upstream, "commit", "-m", "u1");
    git(fork, "clone", upstream, ".");
    mkdirSync(join(fork, "lp"), { recursive: true });
    mkdirSync(join(fork, "scripts"), { recursive: true });
    writeFileSync(join(fork, "lp", "overlays.manifest"), "lp\n");
    writeFileSync(join(fork, "scripts", "t3-sync.sh"), readFileSync(SCRIPT));
    spawnSync("chmod", ["+x", join(fork, "scripts", "t3-sync.sh")]);
    git(fork, "add", "lp", "scripts");
    git(fork, "commit", "-m", "overlay");

    const env = {
      ...process.env,
      T3_SYNC_HOME: home,
      T3_SYNC_SKILL_HOME: home,
      T3_SYNC_UPSTREAM_REMOTE: "origin",
      T3_SYNC_UPSTREAM_REF: "main",
      T3_SYNC_KEEP: "1",
    };

    writeFileSync(join(upstream, "README"), "u2\n");
    git(upstream, "add", "README");
    git(upstream, "commit", "-m", "u2");
    const first = spawnSync("bash", [join(fork, "scripts", "t3-sync.sh"), "--apply"], {
      cwd: fork,
      encoding: "utf8",
      env,
    });
    assert.equal(first.status, 0, first.stdout + first.stderr);

    writeFileSync(join(upstream, "README"), "u3\n");
    git(upstream, "add", "README");
    git(upstream, "commit", "-m", "u3");
    const second = spawnSync("bash", [join(fork, "scripts", "t3-sync.sh"), "--apply"], {
      cwd: fork,
      encoding: "utf8",
      env,
    });
    assert.equal(second.status, 0, second.stdout + second.stderr);
    const snaps = spawnSync("bash", ["-lc", `ls -1 "${home}/sync-snapshots"`], { encoding: "utf8" });
    const ids = snaps.stdout.trim().split("\n").filter(Boolean);
    assert.equal(ids.length, 1, snaps.stdout);
  });
});
