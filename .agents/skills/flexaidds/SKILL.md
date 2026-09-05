---
name: flexaidds
description: FlexAIDDS Astex benchmark surface in this t3code fork. Use for arms, compare, standdown, admit, rank12, deck, DatasetRunner status, benchmark dataset registry, and bench status. Enforces SCORE_NATIVE only, no 85-launch, no new search arm, no GA pb_clash, and 2HR7 as canary-only (84 of canonical 85). Default roots are ~/Projects/FlexAIDdS, ~/flexaidds_results, and ~/Downloads/Artifacts.
---

# FlexAIDDS bench (t3code)

This skill is the T3 Code stand-in for LP's omp `bench` extension. Run the CLI from this checkout; do not invent a parallel campaign. Heavy docking stays in the FlexAIDDS repo. T3 **inspects** DatasetRunner and dataset assets; it does not launch an 85-target run.

## Defaults (overridable)

| Role | Path / env |
| --- | --- |
| Project | `~/Projects/FlexAIDdS` (`FLEXAIDDS_ROOT`) |
| Results | `~/flexaidds_results` (`FLEXAIDDS_RESULTS`) |
| Artifacts | `~/Downloads/Artifacts` (`FLEXAIDDS_ARTIFACTS`) |
| PoseBust | `~/Projects/PoseBust` (`POSEBUST_ROOT`) |
| Shannon | `~/Projects/Shannon` (`SHANNON_ROOT`) |
| State | `~/.t3code/bench` (`T3_BENCH_HOME`) |

Point any of those env vars at another tree if the Mac paths differ.

## Commands

In the composer, `$flexaidds` (or `$bench`) then name the command. Same binaries:

```bash
node lp/bench/cli.mjs arms
node lp/bench/cli.mjs compare pool-native claim-ready
node lp/bench/cli.mjs standdown
node lp/bench/cli.mjs admit canary-2hr7
node lp/bench/cli.mjs rank12 ~/flexaidds_results/astex_v2.csv
node lp/bench/cli.mjs deck ~/flexaidds_results/astex_v2.csv
node lp/bench/cli.mjs status
node lp/bench/cli.mjs dataset
node lp/bench/cli.mjs dataset dry-run-cmd
node lp/bench/cli.mjs posebust
node lp/bench/cli.mjs session start --arm canary-2hr7 --pdb 2HR7
```

## Dataset runner (read-safe)

Lives in FlexAIDDS, not in this fork:

- Shim: `benchmarks/DatasetRunner.py` → `flexaidds.dataset_runner.runner`
- CLI: `python3 -m benchmarks.run` (`benchmarks/run.py`)
- Standard: `benchmarks/BENCHMARK_STANDARD.md`
- Contract: `benchmarks/protocols/admission_metrics_contract.md`
- Registry YAMLs: `benchmarks/datasets/*.yaml` (`astex_diverse`, `astex_nonnative`, CASF, ITC, …)
- Canonical Astex tree: `benchmarks/astex_diverse/astex_diverse/`

`dataset` / `status` only check that those paths exist and list YAML slugs. `dataset run` is refused. A printed dry-run is:

```bash
python3 -m benchmarks.run --all --tier 1 --dry-run
```

Do not drop `--dry-run`. Do not start an 85-target docking from T3. Standdown unless LP greenlights a real campaign.

## Standdown (hard)

- No 85-launch
- No new search arm
- No GA `pb_clash`
- `2HR7` is canary-only — count as **84 of canonical 85**
- Metric lane **SCORE_NATIVE** only
- No Science sqlite writes from this adapter

`admit` refuses violators. `deck` prints a **CONFLICT** banner when a CSV row sets more than one of `hung`, `pool`, `claim_ready`.

## CSV

Astex V2-style header:

```text
pdb,arm_id,metric_lane,hung,pool,claim_ready,score
```

If the file is missing, commands still run and report empty rows.

## Sessions

`session start` records `session_id → arm_id → pdb → metric_lane → paths` under `~/.t3code/bench/sessions.json`. Sync/rollback must not delete that directory.

Use `$posebust` for native pose checks and `$shannon` for the gate.
