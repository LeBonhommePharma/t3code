---
description: Inspect FlexAIDDS DatasetRunner entrypoints (read-only; never launch 85-target docking)
argument-hint: "[status|dry-run-cmd|registry]"
---

```bash
node lp/bench/cli.mjs dataset $ARGUMENTS
```

Empty arguments means `status`. Official module is `python3 -m flexaidds.dataset_runner` with `PYTHONPATH=$FLEXAIDDS_ROOT/python`. `run`/`launch` without `--dry-run` are refused. Printed dry-run keeps `--dry-run` and is not executed.
