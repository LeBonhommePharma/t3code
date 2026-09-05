#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  ARMS,
  STANDDOWN,
  formatDeck,
  loadConfig,
  metricConflict,
  parseAstexCsv,
  rank12,
  standdownViolations,
} from "./lib.mjs";
import { collapseReferee, assertActionAllowed } from "./referee.mjs";
import { readSessions, startSession } from "./sessions.mjs";
import {
  datasetRunBlocked,
  defaultMacPaths,
  inspectBenchmarkDataset,
  inspectDataset,
  inspectPosebust,
  inspectShannon,
} from "./inspect.mjs";

function usage() {
  return `Usage: node lp/bench/cli.mjs <command>

Commands:
  arms                 list campaign arms and standdown flags
  compare [a] [b]      compare two arms (ids)
  standdown            print constraints and violations
  admit <arm>          admit an arm if standdown allows
  rank12 [csv]         rank scores from an Astex V2 CSV
  deck [csv]           markdown deck (CONFLICT banner if hung/pool/claim_ready clash)
  status               paths, gate, sessions, dataset runner, PoseBust
  dataset [status]     read-only DatasetRunner / Astex registry inspect
  dataset registry     YAML slugs + BENCHMARK_STANDARD / admission contract paths
  dataset dry-run-cmd  print the --dry-run command; does not execute
  shannon              Shannon root / gate status (fail-open unless SHANNON_GATE_LIVE=1)
  posebust [status]    find the PoseBust CLI / tree (score-only)
  posebust build       print cmake hint; does not compile
  posebust validate --pred <lig> --protein <rec> [-l crystal]
  session start --arm <id> [--pdb PDB]

Slash/skills (T3 composer): /bench /admit /rank12 /dataset-runner /benchmark-dataset /posebust /shannon /flexaidds
Claude also loads .claude/commands for those names. $mentions work on any line.

Default Mac paths (override with env):
  FLEXAIDDS_ROOT=$HOME/Projects/FlexAIDdS
  POSEBUST_ROOT=$HOME/Projects/PoseBust
  SHANNON_ROOT=$HOME/Projects/Shannon
  FLEXAIDDS_RESULTS=$HOME/flexaidds_results
  FLEXAIDDS_ARTIFACTS=$HOME/Downloads/Artifacts
  T3_BENCH_HOME=$HOME/.t3code/bench

Shannon gate: fail-open unless SHANNON_GATE_LIVE=1
Standdown: no 85-launch, no new search arm, no GA pb_clash, 2HR7 canary-only.
`;
}

function loadRows(config, csvPath) {
  const path = csvPath ?? join(config.results, "astex_v2.csv");
  if (!existsSync(path)) return { path, rows: [] };
  return { path, rows: parseAstexCsv(readFileSync(path, "utf8")) };
}

function findArm(id) {
  return ARMS.find((arm) => arm.id === id) ?? null;
}

async function main(argv) {
  const command = argv[0];
  const config = loadConfig();
  mkdirSync(config.stateDir, { recursive: true });

  switch (command) {
    case undefined:
    case "-h":
    case "--help":
      process.stdout.write(usage());
      return 0;
    case "arms": {
      process.stdout.write(
        `${JSON.stringify({ standdown: STANDDOWN, arms: ARMS }, null, 2)}\n`,
      );
      return 0;
    }
    case "compare": {
      const left = findArm(argv[1] ?? "pool-native");
      const right = findArm(argv[2] ?? "claim-ready");
      if (!left || !right) {
        process.stderr.write("unknown arm id\n");
        return 1;
      }
      process.stdout.write(`${JSON.stringify({ left, right }, null, 2)}\n`);
      return 0;
    }
    case "standdown": {
      const report = ARMS.map((arm) => ({
        id: arm.id,
        violations: standdownViolations(arm),
      }));
      process.stdout.write(
        `${JSON.stringify({ constraints: STANDDOWN, report }, null, 2)}\n`,
      );
      return 0;
    }
    case "admit": {
      const arm = findArm(argv[1] ?? "");
      if (!arm) {
        process.stderr.write("admit requires a known arm id\n");
        return 1;
      }
      await assertActionAllowed("admit", config.shannon);
      const violations = standdownViolations(arm);
      if (violations.length > 0) {
        process.stderr.write(`standdown blocked ${arm.id}: ${violations.join("; ")}\n`);
        return 1;
      }
      const file = join(config.stateDir, "admitted.json");
      let admitted = [];
      if (existsSync(file)) {
        try {
          admitted = JSON.parse(readFileSync(file, "utf8"));
        } catch {
          admitted = [];
        }
      }
      if (!admitted.includes(arm.id)) admitted.push(arm.id);
      writeFileSync(file, `${JSON.stringify(admitted, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify({ admitted: arm.id }, null, 2)}\n`);
      return 0;
    }
    case "rank12": {
      const { path, rows } = loadRows(config, argv[1]);
      process.stdout.write(`${JSON.stringify({ csv: path, rank12: rank12(rows) }, null, 2)}\n`);
      return 0;
    }
    case "deck": {
      const { rows } = loadRows(config, argv[1]);
      process.stdout.write(formatDeck({ arms: ARMS, rows }));
      return 0;
    }
    case "status": {
      const { path, rows } = loadRows(config);
      const conflicts = rows.map(metricConflict).filter(Boolean);
      const gate = await collapseReferee({ action: "status", shannonRoot: config.shannon });
      process.stdout.write(
        `${JSON.stringify(
          {
            config,
            defaults: defaultMacPaths(),
            standdown: STANDDOWN,
            csv: path,
            rowCount: rows.length,
            conflicts,
            gate,
            sessions: readSessions(config.stateDir),
            dataset: inspectDataset(config),
            benchmarkDataset: inspectBenchmarkDataset(config),
            posebust: inspectPosebust(config),
            shannon: inspectShannon(config),
          },
          null,
          2,
        )}\n`,
      );
      return 0;
    }
    case "runner":
    case "dataset": {
      const sub = argv[1] ?? "status";
      if (sub === "dry-run-cmd" || sub === "help") {
        const inspect = inspectDataset(config);
        process.stdout.write(
          `${JSON.stringify({ inspect, dryRunCmd: inspect.policy.dryRunCmd, dryRunAll: inspect.policy.dryRunAll }, null, 2)}\n`,
        );
        return 0;
      }
      if (sub === "registry" || sub === "assets") {
        process.stdout.write(`${JSON.stringify(inspectBenchmarkDataset(config), null, 2)}\n`);
        return 0;
      }
      if (sub === "run" || sub === "launch") {
        const inspect = inspectDataset(config);
        if (datasetRunBlocked(argv.slice(1)) === null) {
          process.stdout.write(
            `${JSON.stringify(
              {
                execute: false,
                reason: "print-only. Do not drop --dry-run. T3 never launches docking.",
                dryRunCmd: inspect.policy.dryRunCmd,
                dryRunAll: inspect.policy.dryRunAll,
              },
              null,
              2,
            )}\n`,
          );
          return 0;
        }
        process.stderr.write(`${datasetRunBlocked(argv.slice(1))}\n`);
        return 1;
      }
      process.stdout.write(`${JSON.stringify(inspectDataset(config), null, 2)}\n`);
      return 0;
    }
    case "shannon": {
      process.stdout.write(`${JSON.stringify(inspectShannon(config), null, 2)}\n`);
      return 0;
    }
    case "registry":
    case "assets": {
      process.stdout.write(`${JSON.stringify(inspectBenchmarkDataset(config), null, 2)}\n`);
      return 0;
    }
    case "posebust": {
      const sub = argv[1] ?? "status";
      if (sub === "build") {
        const inspect = inspectPosebust(config);
        process.stdout.write(
          `${JSON.stringify(
            {
              execute: false,
              reason: "print-only. Run cmake yourself after LP greenlights a build.",
              buildHint: inspect.policy.buildHint,
              binary: inspect.binary,
              presentRoots: inspect.presentRoots,
            },
            null,
            2,
          )}\n`,
        );
        return 0;
      }
      if (sub === "validate") {
        const predFlag = argv.indexOf("--pred");
        const proteinFlag = argv.indexOf("--protein");
        const crystalFlag = argv.includes("-l") ? argv.indexOf("-l") : argv.indexOf("--crystal");
        const pred = predFlag >= 0 ? argv[predFlag + 1] : undefined;
        const protein = proteinFlag >= 0 ? argv[proteinFlag + 1] : undefined;
        const crystal = crystalFlag >= 0 ? argv[crystalFlag + 1] : undefined;
        if (!pred || !protein) {
          process.stderr.write("posebust validate requires --pred and --protein (native score-only)\n");
          return 1;
        }
        const inspect = inspectPosebust(config);
        if (!inspect.binary) {
          process.stderr.write(
            `posebust CLI not found. ${inspect.policy.buildHint}\nOr set POSEBUST_BIN / POSEBUST_ROOT.\n`,
          );
          return 1;
        }
        if (argv.includes("--bust") && process.env.POSEBUST_ALLOW_BUST !== "1") {
          process.stderr.write("refusing --bust (no GA pb_clash). NativePoseQC only unless POSEBUST_ALLOW_BUST=1.\n");
          return 1;
        }
        const args = ["--native", "--pred", pred, "--protein", protein];
        if (crystal) args.push("-l", crystal);
        const result = spawnSync(inspect.binary, args, { encoding: "utf8" });
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
        return result.status === 0 ? 0 : result.status ?? 1;
      }
      process.stdout.write(`${JSON.stringify(inspectPosebust(config), null, 2)}\n`);
      return 0;
    }
    case "session": {
      if (argv[1] !== "start") {
        process.stderr.write("usage: session start --arm <id> [--pdb PDB]\n");
        return 1;
      }
      const armFlag = argv.indexOf("--arm");
      const pdbFlag = argv.indexOf("--pdb");
      const armId = armFlag >= 0 ? argv[armFlag + 1] : argv[2];
      const pdb = pdbFlag >= 0 ? argv[pdbFlag + 1] : undefined;
      if (!armId) {
        process.stderr.write("session start requires --arm\n");
        return 1;
      }
      const session = startSession({ armId, pdb, config });
      process.stdout.write(`${JSON.stringify(session, null, 2)}\n`);
      return 0;
    }
    default:
      process.stderr.write(usage());
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
