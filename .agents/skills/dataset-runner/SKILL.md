---
name: dataset-runner
description: FlexAIDDS DatasetRunner inspect for this t3code fork. Use for status, dry-run command print, and runner entrypoints. Never launch 85-target docking. Default root ~/Projects/FlexAIDdS (FLEXAIDDS_ROOT). Slash: /dataset-runner or $dataset-runner.
---

# DatasetRunner (read-safe)

The runner lives in FlexAIDDS, not in this fork. T3 only **inspects**. Official CLI:

```bash
PYTHONPATH="$FLEXAIDDS_ROOT/python" python3 -m flexaidds.dataset_runner --help
```

| Entry         | Path under FlexAIDDS                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| Python CLI    | `python/flexaidds/dataset_runner/cli.py` (`python3 -m flexaidds.dataset_runner`) |
| Python runner | `python/flexaidds/dataset_runner/runner.py`                                      |
| Shim          | `benchmarks/DatasetRunner.py` → `flexaidds.dataset_runner.runner`                |
| Shim CLI      | `benchmarks/run.py` → `flexaidds.dataset_runner.cli`                             |
| Native C++    | `LIB/DatasetRunner.h` (inspect only; do not compile from T3)                     |

```bash
node lp/bench/cli.mjs dataset
node lp/bench/cli.mjs dataset dry-run-cmd
```

Printed dry-run (do not drop `--dry-run`, do not execute from T3):

```bash
PYTHONPATH="$FLEXAIDDS_ROOT/python" python3 -m flexaidds.dataset_runner --all --tier 1 --dry-run
```

`dataset run` without `--dry-run` is refused. No 85-launch. No Science sqlite writes. Pair `$benchmark-dataset` for Astex YAML / BENCHMARK_STANDARD / admission contract.
