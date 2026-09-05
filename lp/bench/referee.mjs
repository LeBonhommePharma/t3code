import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";

const { spawnSync } = NodeChildProcess;
const { join } = NodePath;

const WRITE_ACTIONS = new Set(["launchish", "write-results", "admit", "standdown-apply"]);

export async function collapseReferee(input = {}) {
  const live = process.env.SHANNON_GATE_LIVE === "1";
  if (!live) {
    return {
      live: false,
      allowed: true,
      reason: "fail-open stub (set SHANNON_GATE_LIVE=1 to enforce the Shannon gate)",
    };
  }

  const shannonRoot = input.shannonRoot;
  const action = input.action ?? "status";
  const result = spawnSync(
    process.env.SHANNON_GATE_BIN ?? "python3",
    ["-m", "agent_manager", "monitor", "--agent", "t3-bench", "--task", action, "--json"],
    {
      cwd: shannonRoot,
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: join(shannonRoot ?? "", "hub") },
      timeout: 20_000,
    },
  );

  if (result.status !== 0) {
    const blocked = WRITE_ACTIONS.has(action);
    return {
      live: true,
      allowed: !blocked,
      reason: blocked
        ? `Shannon gate unreachable (exit ${String(result.status)}); write/launchish blocked`
        : `Shannon gate unreachable (exit ${String(result.status)}); read allowed`,
    };
  }

  let parsed = {};
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
    parsed = {};
  }
  const allowed = parsed.ok !== false && parsed.allowed !== false;
  return {
    live: true,
    allowed,
    reason: parsed.reason ?? (allowed ? "gate allowed" : "gate denied"),
  };
}

export async function assertActionAllowed(action, shannonRoot) {
  const verdict = await collapseReferee({ action, shannonRoot });
  if (!verdict.allowed) {
    const error = new Error(`Shannon gate blocked ${action}: ${verdict.reason}`);
    error.verdict = verdict;
    throw error;
  }
  return verdict;
}
