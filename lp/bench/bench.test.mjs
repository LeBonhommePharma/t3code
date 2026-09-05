import * as NodeTest from "node:test";
import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";

const { describe, it } = NodeTest;
const assert = NodeAssert;
const { mkdtempSync, mkdirSync, writeFileSync } = NodeFS;
const { tmpdir } = NodeOS;
const { join } = NodePath;
const { spawnSync } = NodeChildProcess;
const { fileURLToPath } = NodeURL;

import {
  ARMS,
  formatDeck,
  loadConfig,
  metricConflict,
  parseAstexCsv,
  rank12,
  standdownViolations,
} from "./lib.mjs";
import { datasetRunBlocked, inspectBenchmarkDataset, inspectDataset } from "./inspect.mjs";
import { startSession, readSessions } from "./sessions.mjs";
import { collapseReferee } from "./referee.mjs";

const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

describe("dataset inspect policy", () => {
  it("allows dry-run/help and blocks real DatasetRunner launches", () => {
    assert.equal(datasetRunBlocked(["--dry-run"]), null);
    assert.equal(datasetRunBlocked(["help"]), null);
    assert.match(datasetRunBlocked(["--all", "--tier", "1"]), /standdown-blocked/);
    const missing = inspectDataset(loadConfig({ flexaidds: join(tmpdir(), "no-flexaidds") }));
    assert.equal(missing.present, false);
  });
});

describe("bench standdown", () => {
  it("allows the stock arms and rejects 85-launch / pb_clash / non-native lanes", () => {
    for (const arm of ARMS) {
      assert.deepEqual(standdownViolations(arm), []);
    }
    assert.ok(
      standdownViolations({
        id: "search-new",
        searchArm: true,
        launch85: true,
        gaPbClash: true,
        pdb: "2HR7",
        canary: false,
        metricLane: "OTHER",
      }).length >= 4,
    );
  });
});

describe("astex csv", () => {
  it("flags hung vs pool vs claim_ready CONFLICT", () => {
    const rows = parseAstexCsv(
      [
        "pdb,arm_id,metric_lane,hung,pool,claim_ready,score",
        "1ABC,pool-native,SCORE_NATIVE,1,1,0,9",
      ].join("\n"),
    );
    assert.equal(rows.length, 1);
    assert.match(metricConflict(rows[0]), /CONFLICT/);
    const deck = formatDeck({ arms: ARMS, rows });
    assert.match(deck, /CONFLICT/);
  });

  it("ranks the top 12 by score", () => {
    const rows = Array.from({ length: 15 }, (_, index) => ({
      pdb: `P${index}`,
      armId: "pool-native",
      metricLane: "SCORE_NATIVE",
      hung: 0,
      pool: 1,
      claimReady: 0,
      score: index,
    }));
    const ranked = rank12(rows);
    assert.equal(ranked.length, 12);
    assert.equal(ranked[0].score, 14);
  });
});

describe("sessions and config", () => {
  it("glues session_id to arm, pdb, lane, and LP default paths", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "t3-bench-"));
    const session = startSession({
      sessionId: "sess-1",
      armId: "canary-2hr7",
      pdb: "2HR7",
      config: { stateDir },
    });
    assert.equal(session.armId, "canary-2hr7");
    assert.equal(session.pdb, "2HR7");
    assert.equal(session.metricLane, "SCORE_NATIVE");
    assert.match(session.paths.flexaidds, /FlexAIDdS/);
    assert.equal(readSessions(stateDir).length, 1);
    const config = loadConfig({ flexaidds: "~/Projects/FlexAIDdS" });
    assert.match(config.flexaidds, /Projects\/FlexAIDdS$/);
  });
});

describe("shannon referee", () => {
  it("fail-opens when the live flag is unset", async () => {
    delete process.env.SHANNON_GATE_LIVE;
    const verdict = await collapseReferee({ action: "write-results" });
    assert.equal(verdict.live, false);
    assert.equal(verdict.allowed, true);
  });
});

describe("dataset and posebust inspect", () => {
  it("reports missing trees without launching docking", () => {
    const status = spawnSync(process.execPath, [CLI, "dataset"], {
      encoding: "utf8",
      env: { ...process.env, FLEXAIDDS_ROOT: join(tmpdir(), "no-flexaidds") },
    });
    assert.equal(status.status, 0, status.stderr);
    const parsed = JSON.parse(status.stdout);
    assert.equal(parsed.present, false);
    assert.match(parsed.policy.dryRunCmd, /flexaidds\.dataset_runner/);

    const blocked = spawnSync(process.execPath, [CLI, "dataset", "run"], {
      encoding: "utf8",
      env: { ...process.env, FLEXAIDDS_ROOT: join(tmpdir(), "no-flexaidds") },
    });
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /standdown-blocked/);
  });

  it("lists YAML registry and protocol paths without launching docking", () => {
    const root = mkdtempSync(join(tmpdir(), "flexaidds-"));
    mkdirSync(join(root, "benchmarks/datasets"), { recursive: true });
    mkdirSync(join(root, "benchmarks/protocols"), { recursive: true });
    mkdirSync(join(root, "python/flexaidds/dataset_runner"), { recursive: true });
    mkdirSync(join(root, "LIB"), { recursive: true });
    writeFileSync(join(root, "benchmarks/datasets/astex_diverse.yaml"), "name: astex_diverse\n");
    writeFileSync(join(root, "benchmarks/BENCHMARK_STANDARD.md"), "# standard\n");
    writeFileSync(join(root, "benchmarks/protocols/admission_metrics_contract.md"), "# contract\n");
    writeFileSync(join(root, "python/flexaidds/dataset_runner/cli.py"), "# cli\n");
    writeFileSync(join(root, "python/flexaidds/dataset_runner/runner.py"), "# runner\n");
    writeFileSync(join(root, "LIB/DatasetRunner.h"), "// header\n");
    const registry = spawnSync(process.execPath, [CLI, "dataset", "registry"], {
      encoding: "utf8",
      env: { ...process.env, FLEXAIDDS_ROOT: root },
    });
    assert.equal(registry.status, 0, registry.stderr);
    const parsed = JSON.parse(registry.stdout);
    assert.equal(parsed.present, true);
    assert.deepEqual(
      parsed.registry.map((row) => row.slug),
      ["astex_diverse"],
    );
    assert.equal(parsed.protocols.standard.exists, true);
    assert.equal(parsed.protocols.contract.exists, true);
    assert.match(parsed.astexNote, /canary-only/);
    const dataset = inspectDataset(loadConfig({ flexaidds: root }));
    assert.equal(dataset.pythonCli.exists, true);
    assert.equal(dataset.pythonRunner.exists, true);
    assert.equal(dataset.nativeHeader.exists, true);

    const listed = inspectBenchmarkDataset(loadConfig({ flexaidds: root }));
    assert.equal(listed.registry.length, 1);
    assert.equal(
      inspectDataset(loadConfig({ flexaidds: root })).yamlSlugs[0],
      "astex_diverse.yaml",
    );
    assert.equal(parsed.protocols.astexNative85.exists, false);

    const printed = spawnSync(process.execPath, [CLI, "dataset", "run", "--dry-run"], {
      encoding: "utf8",
      env: { ...process.env, FLEXAIDDS_ROOT: root },
    });
    assert.equal(printed.status, 0, printed.stderr);
    const dry = JSON.parse(printed.stdout);
    assert.equal(dry.execute, false);
    assert.match(dry.dryRunAll, /--dry-run/);
  });

  it("lists PoseBust defaults and refuses --bust without an allow flag", () => {
    const pose = spawnSync(process.execPath, [CLI, "posebust"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: "/usr/bin:/bin",
        POSEBUST_BIN: "",
        POSEBUST_ROOT: join(tmpdir(), "no-posebust"),
        FLEXAIDDS_ROOT: join(tmpdir(), "no-flexaidds"),
      },
    });
    assert.equal(pose.status, 0, pose.stderr);
    const parsed = JSON.parse(pose.stdout);
    assert.match(parsed.defaultRoot, /no-posebust$/);
    assert.match(parsed.policy.never.join(" "), /pb_clash/);

    const bust = spawnSync(
      process.execPath,
      [CLI, "posebust", "validate", "--pred", "a.sdf", "--protein", "b.pdb", "--bust"],
      { encoding: "utf8", env: { ...process.env, POSEBUST_ROOT: join(tmpdir(), "no-posebust") } },
    );
    assert.equal(bust.status, 1);
    assert.match(bust.stderr, /posebust CLI not found|refusing --bust/);
  });

  it("prints a PoseBust build hint without compiling", () => {
    const build = spawnSync(process.execPath, [CLI, "posebust", "build"], {
      encoding: "utf8",
      env: { ...process.env, POSEBUST_ROOT: join(tmpdir(), "no-posebust") },
    });
    assert.equal(build.status, 0, build.stderr);
    const parsed = JSON.parse(build.stdout);
    assert.equal(parsed.execute, false);
    assert.match(parsed.buildHint, /cmake/);
  });

  it("finds nested FlexAIDDS LIB/PoseBust without treating it as the official CLI", () => {
    const root = mkdtempSync(join(tmpdir(), "flexaidds-"));
    mkdirSync(join(root, "LIB/PoseBust"), { recursive: true });
    writeFileSync(join(root, "LIB/PoseBust/Engine.h"), "// nested library\n");
    const pose = spawnSync(process.execPath, [CLI, "posebust"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: "/usr/bin:/bin",
        POSEBUST_BIN: "",
        FLEXAIDDS_ROOT: root,
        POSEBUST_ROOT: join(tmpdir(), "no-posebust-cli"),
      },
    });
    assert.equal(pose.status, 0, pose.stderr);
    const parsed = JSON.parse(pose.stdout);
    assert.equal(parsed.binary, null);
    assert.ok(parsed.nestedPresent.some((path) => path.endsWith("LIB/PoseBust")));
    assert.match(parsed.policy.buildHint, /library/);
  });

  it("prints Shannon inspect without enabling the live gate", () => {
    delete process.env.SHANNON_GATE_LIVE;
    const shannon = spawnSync(process.execPath, [CLI, "shannon"], {
      encoding: "utf8",
      env: { ...process.env, SHANNON_ROOT: join(tmpdir(), "no-shannon"), SHANNON_GATE_LIVE: "" },
    });
    assert.equal(shannon.status, 0, shannon.stderr);
    const parsed = JSON.parse(shannon.stdout);
    assert.equal(parsed.present, false);
    assert.equal(parsed.gateLive, false);
  });
});

describe("cli", () => {
  it("prints arms and a conflict deck", () => {
    const arms = spawnSync(process.execPath, [CLI, "arms"], { encoding: "utf8" });
    assert.equal(arms.status, 0, arms.stderr);
    assert.match(arms.stdout, /canary-2hr7/);

    const csv = join(mkdtempSync(join(tmpdir(), "t3-bench-csv-")), "astex_v2.csv");
    writeFileSync(
      csv,
      "pdb,arm_id,metric_lane,hung,pool,claim_ready,score\n2HR7,canary-2hr7,SCORE_NATIVE,0,0,1,11\n",
    );
    const deck = spawnSync(process.execPath, [CLI, "deck", csv], { encoding: "utf8" });
    assert.equal(deck.status, 0, deck.stderr);
    assert.match(deck.stdout, /Rank 12/);
  });
});
