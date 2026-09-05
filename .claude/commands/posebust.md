---
description: PoseBust C++26 native pose checks (status, build hint, score-only validate). No GA pb_clash.
argument-hint: "[status|build|validate --pred <lig> --protein <rec>]"
---

Prefer the official `posebust` CLI when on PATH. Default root `~/Projects/PoseBust` (`POSEBUST_ROOT`). Nested FlexAIDDS tree is `LIB/PoseBust` (library, not a second CLI).

```bash
node lp/bench/cli.mjs posebust $ARGUMENTS
```

Empty arguments means `status`. `build` prints cmake and does not compile. `validate` is NativePoseQC only unless `POSEBUST_ALLOW_BUST=1`.
