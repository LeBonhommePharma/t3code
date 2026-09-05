---
name: bench
description: T3 Code first-party FlexAIDDS/Shannon/PoseBust bench CLI. Use for /bench /admit /rank12 /dataset-runner /benchmark-dataset /posebust /shannon /flexaidds. Prefers same-repo lp/bench over omp extensions.
---

# bench

Entry point: `node lp/bench/cli.mjs`. Composer slash (when skills are in the slash menu) and `$` mentions:

| Surface                                   | What it does                                         |
| ----------------------------------------- | ---------------------------------------------------- |
| `/bench` `$bench`                         | arms, status, standdown, session                     |
| `/admit` `$admit`                         | admit a standdown-safe arm                           |
| `/rank12` `$rank12`                       | top-12 SCORE_NATIVE CSV                              |
| `/dataset-runner` `$dataset-runner`       | DatasetRunner inspect (no docking)                   |
| `/benchmark-dataset` `$benchmark-dataset` | Astex YAML / BENCHMARK_STANDARD / admission contract |
| `/posebust` `$posebust`                   | native pose status/build-hint/validate               |
| `/shannon` `$shannon`                     | Shannon root + fail-open gate                        |
| `/flexaidds` `$flexaidds`                 | campaign + DatasetRunner / Astex                     |

Claude also loads `.claude/commands/*.md` for the same names.

Enable on this machine:

```bash
scripts/t3-sync.sh --install-skills
```

That copies those skills into `~/.agents/skills`, `~/.claude/skills`, `~/.cursor/skills`, and `~/.codex/skills`, plus Claude slash files into `~/.claude/commands`. Merge-only: extra LP files in those dirs are kept. It does not touch `~/.t3/userdata`.
