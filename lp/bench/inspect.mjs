import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { expandPath, loadConfig, STANDDOWN } from "./lib.mjs";

export const DATASET_ENTRYPOINTS = {
  runnerShim: "benchmarks/DatasetRunner.py",
  cliShim: "benchmarks/run.py",
  pythonModule: "benchmarks.run",
  standard: "benchmarks/BENCHMARK_STANDARD.md",
  contract: "benchmarks/protocols/admission_metrics_contract.md",
  datasetsDir: "benchmarks/datasets",
  astexCanonical: "benchmarks/astex_diverse/astex_diverse",
  astexManifest: "benchmarks/protocols/astex85_target_manifest.json",
};

function existsEntry(root, relative) {
  const path = join(root, relative);
  return { path, exists: existsSync(path) };
}

function listYamlSlugs(datasetsDir) {
  if (!existsSync(datasetsDir)) return [];
  return readdirSync(datasetsDir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort();
}

function which(bin) {
  const result = spawnSync("sh", ["-c", 'command -v "$1"', "command-v", bin], {
    encoding: "utf8",
  });
  const path = result.stdout.trim();
  return path.length > 0 ? path : null;
}

export function inspectDataset(config = loadConfig()) {
  const root = config.flexaidds;
  const datasetsDir = join(root, DATASET_ENTRYPOINTS.datasetsDir);
  return {
    present: existsSync(root),
    root,
    pythonModule: `python3 -m ${DATASET_ENTRYPOINTS.pythonModule}`,
    runner: existsEntry(root, DATASET_ENTRYPOINTS.runnerShim),
    cli: existsEntry(root, DATASET_ENTRYPOINTS.cliShim),
    standard: existsEntry(root, DATASET_ENTRYPOINTS.standard),
    contract: existsEntry(root, DATASET_ENTRYPOINTS.contract),
    astexCanonical: existsEntry(root, DATASET_ENTRYPOINTS.astexCanonical),
    astexManifest: existsEntry(root, DATASET_ENTRYPOINTS.astexManifest),
    datasetsDir: existsEntry(root, DATASET_ENTRYPOINTS.datasetsDir),
    yamlSlugs: listYamlSlugs(datasetsDir),
    standdown: STANDDOWN,
    policy: {
      default: "read-only status. Do not launch docking.",
      never: ["85-target launch", "new search arm", "GA pb_clash insert", "Science sqlite writes"],
      dryRunCmd: `python3 -m ${DATASET_ENTRYPOINTS.pythonModule} --help`,
      dryRunAll: `python3 -m ${DATASET_ENTRYPOINTS.pythonModule} --all --tier 1 --dry-run`,
    },
  };
}

export function inspectPosebust(config = loadConfig()) {
  const roots = [
    config.posebust,
    join(config.flexaidds, "PoseBust"),
    join(config.flexaidds, "third_party/PoseBust"),
    join(config.flexaidds, "external/PoseBust"),
  ].filter(Boolean);
  const uniqueRoots = [...new Set(roots.map((path) => expandPath(path)))];
  const presentRoots = uniqueRoots.filter((path) => existsSync(path));
  const binaryCandidates = [
    process.env.POSEBUST_BIN,
    which("posebust"),
    ...presentRoots.flatMap((root) => [
      join(root, "build/posebust"),
      join(root, "build/apps/posebust"),
    ]),
  ].filter(Boolean);
  const binary = binaryCandidates.find((path) => existsSync(path)) ?? null;
  return {
    defaultRoot: config.posebust,
    presentRoots,
    binary,
    cmake: presentRoots.map((root) => existsEntry(root, "CMakeLists.txt")),
    cliHelp: "posebust --native --pred <lig.sdf> --protein <rec.pdb> [-l crystal.sdf]",
    policy: {
      default: "score-only NativePoseQC. Prefer official posebust CLI when on PATH.",
      never: ["GA pb_clash insert", "upstream --bust unless POSEBUST_ALLOW_BUST=1"],
      buildHint: presentRoots[0]
        ? `cmake -S ${presentRoots[0]} -B ${join(presentRoots[0], "build")} && cmake --build ${join(presentRoots[0], "build")}`
        : `cmake -S ${config.posebust} -B ${join(config.posebust, "build")}`,
    },
  };
}

export function inspectShannon(config = loadConfig()) {
  const root = config.shannon;
  return {
    present: existsSync(root),
    root,
    skill: existsEntry(root, "skills/shannon/SKILL.md"),
    gateLive: process.env.SHANNON_GATE_LIVE === "1",
  };
}

export function datasetRunBlocked(argv = []) {
  const joined = argv.join(" ").toLowerCase();
  if (joined.includes("--dry-run") || joined.includes("--help") || joined === "help") {
    return null;
  }
  return "DatasetRunner docking is standdown-blocked. Use `dataset status` or print `dataset dry-run-cmd`. LP must greenlight any real run; 85-launch is never allowed from T3.";
}

export function defaultMacPaths() {
  return {
    flexaidds: join(homedir(), "Projects/FlexAIDdS"),
    posebust: join(homedir(), "Projects/PoseBust"),
    shannon: join(homedir(), "Projects/Shannon"),
    results: join(homedir(), "flexaidds_results"),
    artifacts: join(homedir(), "Downloads/Artifacts"),
    state: join(homedir(), ".t3code/bench"),
  };
}
