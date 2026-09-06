import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";

const { existsSync, readdirSync } = NodeFS;
const { homedir } = NodeOS;
const { join } = NodePath;
const { spawnSync } = NodeChildProcess;

import { expandPath, loadConfig, STANDDOWN } from "./lib.mjs";

export const DATASET_ENTRYPOINTS = {
  runnerShim: "benchmarks/DatasetRunner.py",
  cliShim: "benchmarks/run.py",
  pythonModule: "flexaidds.dataset_runner",
  pythonCli: "python/flexaidds/dataset_runner/cli.py",
  pythonRunner: "python/flexaidds/dataset_runner/runner.py",
  pythonMain: "python/flexaidds/dataset_runner/__main__.py",
  nativeHeader: "LIB/DatasetRunner.h",
  nativeImpl: "LIB/DatasetRunner.cpp",
  nextgen: "benchmarks/nextgen/runner.py",
  standard: "benchmarks/BENCHMARK_STANDARD.md",
  contract: "benchmarks/protocols/admission_metrics_contract.md",
  datasetsDir: "benchmarks/datasets",
  astexCanonical: "benchmarks/astex_diverse/astex_diverse",
  astexManifest: "benchmarks/protocols/astex85_target_manifest.json",
  astexYamlManifest: "benchmarks/datasets/astex_diverse_manifest.json",
  astexNative85: "benchmarks/datasets/benchmark_astex_native_85.json",
  exclusions: "benchmarks/protocols/science_exclusions.md",
  canonical: "benchmarks/datasets/CANONICAL.md",
};

export const POSEBUST_NESTED = [
  "LIB/PoseBust",
  "PoseBust",
  "external/PoseBust",
  "third_party/PoseBust",
];

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
  const pythonPath = join(root, "python");
  const module = DATASET_ENTRYPOINTS.pythonModule;
  return {
    present: existsSync(root),
    root,
    pythonModule: `PYTHONPATH=${pythonPath} python3 -m ${module}`,
    runner: existsEntry(root, DATASET_ENTRYPOINTS.runnerShim),
    cli: existsEntry(root, DATASET_ENTRYPOINTS.cliShim),
    pythonCli: existsEntry(root, DATASET_ENTRYPOINTS.pythonCli),
    pythonRunner: existsEntry(root, DATASET_ENTRYPOINTS.pythonRunner),
    pythonMain: existsEntry(root, DATASET_ENTRYPOINTS.pythonMain),
    nativeHeader: existsEntry(root, DATASET_ENTRYPOINTS.nativeHeader),
    nativeImpl: existsEntry(root, DATASET_ENTRYPOINTS.nativeImpl),
    nextgen: existsEntry(root, DATASET_ENTRYPOINTS.nextgen),
    standard: existsEntry(root, DATASET_ENTRYPOINTS.standard),
    contract: existsEntry(root, DATASET_ENTRYPOINTS.contract),
    astexCanonical: existsEntry(root, DATASET_ENTRYPOINTS.astexCanonical),
    astexManifest: existsEntry(root, DATASET_ENTRYPOINTS.astexManifest),
    exclusions: existsEntry(root, DATASET_ENTRYPOINTS.exclusions),
    canonical: existsEntry(root, DATASET_ENTRYPOINTS.canonical),
    datasetsDir: existsEntry(root, DATASET_ENTRYPOINTS.datasetsDir),
    yamlSlugs: listYamlSlugs(datasetsDir),
    standdown: STANDDOWN,
    policy: {
      default: "read-only status. Do not launch docking.",
      never: ["85-target launch", "new search arm", "GA pb_clash insert", "Science sqlite writes"],
      dryRunCmd: `PYTHONPATH=${pythonPath} python3 -m ${module} --help`,
      dryRunAll: `PYTHONPATH=${pythonPath} python3 -m ${module} --all --tier 1 --dry-run`,
    },
  };
}

export function inspectPosebust(config = loadConfig()) {
  const standalone = expandPath(config.posebust);
  const nested = POSEBUST_NESTED.map((relative) => join(config.flexaidds, relative));
  const uniqueRoots = [...new Set([standalone, ...nested].filter(Boolean))];
  const presentRoots = uniqueRoots.filter((path) => existsSync(path));
  const nestedPresent = nested.filter((path) => existsSync(path));
  const binaryCandidates = [
    process.env.POSEBUST_BIN,
    which("posebust"),
    join(standalone, "build/posebust"),
    join(standalone, "build/apps/posebust"),
  ].filter(Boolean);
  const binary = binaryCandidates.find((path) => existsSync(path)) ?? null;
  const standalonePresent = existsSync(standalone);
  const buildHint = standalonePresent
    ? `cmake -S ${standalone} -B ${join(standalone, "build")} && cmake --build ${join(standalone, "build")}`
    : nestedPresent[0]
      ? `Official CLI lives in ~/Projects/PoseBust. Nested FlexAIDDS tree is a library (${nestedPresent[0]}). After LP greenlights: cmake -B <flexaidds>/build -DBUILD_TESTING=ON && cmake --build <flexaidds>/build --target test_posebust`
      : `cmake -S ${standalone} -B ${join(standalone, "build")}`;
  return {
    defaultRoot: standalone,
    nestedLib: "LIB/PoseBust",
    presentRoots,
    nestedPresent,
    binary,
    cmake: presentRoots.map((root) => existsEntry(root, "CMakeLists.txt")),
    cliHelp: "posebust --native --pred <lig.sdf> --protein <rec.pdb> [-l crystal.sdf]",
    policy: {
      default:
        "score-only NativePoseQC. Prefer official posebust CLI when on PATH or POSEBUST_BIN.",
      never: ["GA pb_clash insert", "upstream --bust unless POSEBUST_ALLOW_BUST=1"],
      buildHint,
    },
  };
}

export function inspectBenchmarkDataset(config = loadConfig()) {
  const dataset = inspectDataset(config);
  const root = dataset.root;
  return {
    present: dataset.present,
    root,
    astexCanonical: dataset.astexCanonical,
    astexNote: "2HR7 is canary-only (84 of canonical 85). Do not launch the 85-set from T3.",
    protocols: {
      standard: dataset.standard,
      contract: dataset.contract,
      astexManifest: dataset.astexManifest,
      astexYamlManifest: existsEntry(root, DATASET_ENTRYPOINTS.astexYamlManifest),
      astexNative85: existsEntry(root, DATASET_ENTRYPOINTS.astexNative85),
      exclusions: dataset.exclusions,
      canonical: dataset.canonical,
    },
    registry: dataset.yamlSlugs.map((file) => ({
      slug: file.replace(/\.ya?ml$/i, ""),
      file: join(dataset.datasetsDir.path, file),
    })),
    standdown: STANDDOWN,
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
