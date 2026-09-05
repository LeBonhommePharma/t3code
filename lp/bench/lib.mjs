import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const { homedir } = NodeOS;
const { join } = NodePath;

export const DEFAULT_PATHS = {
  flexaidds: join(homedir(), "Projects/FlexAIDdS"),
  results: join(homedir(), "flexaidds_results"),
  artifacts: join(homedir(), "Downloads/Artifacts"),
  shannon: join(homedir(), "Projects/Shannon"),
  posebust: join(homedir(), "Projects/PoseBust"),
};

export const STANDDOWN = {
  no85Launch: true,
  noNewSearchArm: true,
  noGaPbClash: true,
  twoHr7CanaryOnly: true,
  canonicalCount: "84 of canonical 85",
  metricLane: "SCORE_NATIVE",
};

/** Campaign arms. 2HR7 is canary-only and is not a full 85-launch seat. */
export const ARMS = [
  {
    id: "pool-native",
    kind: "pool",
    pdb: null,
    metricLane: "SCORE_NATIVE",
    searchArm: false,
    gaPbClash: false,
    launch85: false,
    canary: false,
  },
  {
    id: "claim-ready",
    kind: "claim",
    pdb: null,
    metricLane: "SCORE_NATIVE",
    searchArm: false,
    gaPbClash: false,
    launch85: false,
    canary: false,
  },
  {
    id: "canary-2hr7",
    kind: "canary",
    pdb: "2HR7",
    metricLane: "SCORE_NATIVE",
    searchArm: false,
    gaPbClash: false,
    launch85: false,
    canary: true,
  },
];

export function expandPath(value) {
  if (!value) return value;
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

export function loadConfig(overrides = {}) {
  return {
    flexaidds: expandPath(
      overrides.flexaidds ?? process.env.FLEXAIDDS_ROOT ?? DEFAULT_PATHS.flexaidds,
    ),
    results: expandPath(
      overrides.results ?? process.env.FLEXAIDDS_RESULTS ?? DEFAULT_PATHS.results,
    ),
    artifacts: expandPath(
      overrides.artifacts ?? process.env.FLEXAIDDS_ARTIFACTS ?? DEFAULT_PATHS.artifacts,
    ),
    shannon: expandPath(overrides.shannon ?? process.env.SHANNON_ROOT ?? DEFAULT_PATHS.shannon),
    posebust: expandPath(overrides.posebust ?? process.env.POSEBUST_ROOT ?? DEFAULT_PATHS.posebust),
    stateDir: expandPath(
      overrides.stateDir ?? process.env.T3_BENCH_HOME ?? join(homedir(), ".t3code/bench"),
    ),
  };
}

export function standdownViolations(arm) {
  const violations = [];
  if (STANDDOWN.no85Launch && arm.launch85) violations.push("85-launch is forbidden");
  if (STANDDOWN.noNewSearchArm && arm.searchArm && arm.id !== "pool-native") {
    violations.push("new search arm is forbidden");
  }
  if (STANDDOWN.noGaPbClash && arm.gaPbClash) violations.push("GA pb_clash is forbidden");
  if (STANDDOWN.twoHr7CanaryOnly && arm.pdb === "2HR7" && !arm.canary) {
    violations.push("2HR7 is canary-only (84 of canonical 85)");
  }
  if (arm.metricLane !== STANDDOWN.metricLane) {
    violations.push(`metric lane must be ${STANDDOWN.metricLane}`);
  }
  return violations;
}

export function parseAstexCsv(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((cell) => cell.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const row = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? "";
    });
    return {
      pdb: row.pdb ?? "",
      armId: row.arm_id ?? row.arm ?? "",
      metricLane: row.metric_lane ?? row.lane ?? STANDDOWN.metricLane,
      hung: Number(row.hung ?? 0),
      pool: Number(row.pool ?? 0),
      claimReady: Number(row.claim_ready ?? row.claimReady ?? 0),
      score: row.score === undefined || row.score === "" ? null : Number(row.score),
    };
  });
}

export function metricConflict(row) {
  const flags = [row.hung > 0, row.pool > 0, row.claimReady > 0].filter(Boolean).length;
  if (flags > 1) {
    return `CONFLICT hung=${row.hung} pool=${row.pool} claim_ready=${row.claimReady} for ${row.pdb || row.armId}`;
  }
  return null;
}

export function rank12(rows) {
  return [...rows]
    .filter((row) => row.score != null && Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

export function formatDeck(input) {
  const conflicts = input.rows.map(metricConflict).filter(Boolean);
  const lines = [
    "# FlexAIDDS bench deck",
    "",
    `- metric lane: ${STANDDOWN.metricLane}`,
    `- standdown: no 85-launch, no new search arm, no GA pb_clash, 2HR7 canary-only (${STANDDOWN.canonicalCount})`,
    `- arms: ${input.arms.map((arm) => arm.id).join(", ")}`,
    `- rows: ${input.rows.length}`,
    "",
  ];
  if (conflicts.length > 0) {
    lines.push("## CONFLICT");
    for (const conflict of conflicts) lines.push(`- ${conflict}`);
    lines.push("");
  }
  lines.push("## Rank 12");
  for (const row of rank12(input.rows)) {
    lines.push(`- ${row.pdb || row.armId} ${row.score}`);
  }
  return `${lines.join("\n")}\n`;
}

export function glueSession(record) {
  return {
    sessionId: record.sessionId,
    armId: record.armId,
    pdb: record.pdb ?? null,
    metricLane: record.metricLane ?? STANDDOWN.metricLane,
    paths: {
      flexaidds: record.flexaidds,
      results: record.results,
      artifacts: record.artifacts,
    },
    createdAt: record.createdAt,
  };
}
