# Fork overlay (LeBonhommePharma)

First-party replacements for LP's omp `bench` extension and a fail-soft sync path. Upstream T3 Code has no plugin API for this, so the fork keeps:

- `lp/bench/` — arms, CSV metrics, sessions, Shannon referee, DatasetRunner inspect, PoseBust
- `.agents/skills/{flexaidds,shannon,bench,admit,rank12,dataset-runner,benchmark-dataset,posebust}/` — `$` / slash-menu skills
- `.claude/commands/{bench,admit,rank12,dataset-runner,benchmark-dataset,posebust,shannon,flexaidds}.md` — Claude `/` catalog
- `scripts/t3-sync.sh` (`scripts/t3-update.sh` alias) — check / apply / rollback against pingdotgg/t3code
- `lp/launchd/com.lebonhomme.t3code-sync.plist` — **written, not loaded**

## Enable bench

```bash
scripts/t3-sync.sh --install-skills
node lp/bench/cli.mjs status
```

Optional live Shannon gate: `export SHANNON_GATE_LIVE=1`.

Default Mac paths (override with env if the tree lives elsewhere):

| Tree | Default | Env |
| --- | --- | --- |
| FlexAIDDS | `~/Projects/FlexAIDdS` | `FLEXAIDDS_ROOT` |
| PoseBust | `~/Projects/PoseBust` | `POSEBUST_ROOT` / `POSEBUST_BIN` |
| Shannon | `~/Projects/Shannon` | `SHANNON_ROOT` |
| Results | `~/flexaidds_results` | `FLEXAIDDS_RESULTS` |
| Artifacts | `~/Downloads/Artifacts` | `FLEXAIDDS_ARTIFACTS` |
| Bench state | `~/.t3code/bench` | `T3_BENCH_HOME` |

`--install-skills` copies into `~/.agents/skills`, `~/.claude/skills`, `~/.cursor/skills`, and `~/.codex/skills`, plus Claude slash files into `~/.claude/commands`. Override the home for those dests with `T3_SYNC_SKILL_HOME` (default `$HOME`).

`dataset` is read-only inspect (YAML registry, DatasetRunner shims, `python3 -m flexaidds.dataset_runner`, BENCHMARK_STANDARD, admission contract). `dataset registry` lists Astex YAML slugs and protocol files. It will not launch 85-target docking. `dataset run` without `--dry-run` is refused; with `--dry-run` it **prints** the command and does not execute. `posebust validate` is native score-only. `posebust build` prints cmake and does not compile. Nested FlexAIDDS PoseBust is `LIB/PoseBust` (library); the official CLI is the standalone repo.

Composer (Settings → General → Show skills in slash menu, plus Claude `.claude/commands`):

| Slash / `$` | Inspect |
| --- | --- |
| `/bench` `$bench` | arms, status, standdown, session |
| `/admit` `$admit` | admit a standdown-safe arm |
| `/rank12` `$rank12` | top-12 SCORE_NATIVE CSV |
| `/dataset-runner` `$dataset-runner` | DatasetRunner entrypoints (no docking) |
| `/benchmark-dataset` `$benchmark-dataset` | Astex YAML / BENCHMARK_STANDARD / admission contract |
| `/posebust` `$posebust` | official CLI status / build hint / NativePoseQC |
| `/shannon` `$shannon` | Shannon root + fail-open gate |
| `/flexaidds` `$flexaidds` | campaign + DatasetRunner / Astex |

State lives in `~/.t3code/bench/` (sessions, admitted arms). Sync snapshots and logs live next to it under `~/.t3code/`. That is **not** `~/.t3/userdata`. Sync rollback never deletes bench sessions or T3 userdata. Skill install is merge-only: extra files LP dropped into `~/.agents/skills/bench` (and siblings) stay.

Standdown: no Science sqlite writes; no surprise 85-target docking; standdown unless LP greenlights; 2HR7 canary-only (84 of canonical 85); SCORE_NATIVE only; no GA `pb_clash`.

## Auto-update (omp-sync spirit)

```bash
scripts/t3-sync.sh --check      # dry-run vs pingdotgg/t3code main + latest GitHub release
scripts/t3-sync.sh --apply      # snapshot → merge → restore overlays → smoke; restore on failure
scripts/t3-sync.sh --rollback   # latest snapshot (or pass an id)
scripts/t3-sync.sh --list
```

`--check` never merges. `--apply` refuses a dirty worktree, keeps the last `T3_SYNC_KEEP` snapshots (default 8), uses `flock` on Linux (mkdir lock on macOS), and exits `2` on network failure without touching HEAD. Logs: `~/.t3code/logs/latest.log`.

LaunchAgent (weekday 10:00, **`--check` only**, never `--apply`) is in `lp/launchd/`. Edit `WorkingDirectory` to this clone. Do **not** `launchctl bootstrap` until that path is right. This repo does not load the agent.

Cron / Bonhomme:

```cron
0 10 * * 1-5 /Users/lp.more/Projects/t3code/scripts/t3-sync.sh --check >> ~/.t3code/logs/cron-t3-sync.log 2>&1
```

BonhommeNotch can tail `~/.t3code/logs/latest.log`; this repo does not load that HUD.
