---
name: posebust
description: Native PoseBust (C++26 PoseBusters) — $posebust /posebust. Score-only NativePoseQC. Prefer official posebust CLI. No GA pb_clash.
---

# PoseBust

LP’s C++26 PoseBusters. Prefer the official `posebust` CLI (`POSEBUST_BIN` or `<POSEBUST_ROOT>/build/posebust`). Nested FlexAIDDS copy is a **library** at `LIB/PoseBust`, not a second CLI. No GA `pb_clash` insert.

Composer: `$posebust` / `/posebust`. Claude extra: `.claude/commands/posebust.md`.

## Locate

```bash
node lp/bench/cli.mjs posebust
node lp/bench/cli.mjs posebust build   # print cmake + ctest only; does not compile
```

Defaults: `~/Projects/PoseBust` (`POSEBUST_ROOT`). Nested: `$FLEXAIDDS_ROOT/LIB/PoseBust`. Override: `POSEBUST_BIN`.

## Validate (score-only)

```bash
posebust --native --pred <lig.sdf> --protein <rec.pdb> [-l crystal.sdf]
# or via T3:
node lp/bench/cli.mjs posebust validate --pred <lig.sdf> --protein <rec.pdb>
```

`--native` is the C++ default. `--bust` is upstream Python PoseBusters — refuse unless `POSEBUST_ALLOW_BUST=1`. NativePoseQC is diagnostic; do not write “PoseBusters passed” from `--native` alone.

## Build (print-only)

`posebust build` prints cmake. It does not compile. Never insert `pb_clash` into a GA JSON.
