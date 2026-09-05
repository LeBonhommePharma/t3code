---
name: posebust
description: PoseBust C++26 pose validation for this t3code fork. Use for status, native score-only validate, and build hints. Prefer the official posebust CLI. Never insert GA pb_clash. Default root ~/Projects/PoseBust; also present inside FlexAIDDS.
---

# PoseBust (t3code)

Standalone C++26 PoseBusters-compatible pose checks. T3 only **finds** and **scores**. It does not rewrite Science sqlite or launch docking.

## Defaults

| Role | Path / env |
| --- | --- |
| Standalone | `~/Projects/PoseBust` (`POSEBUST_ROOT`) |
| Nested | `$FLEXAIDDS_ROOT/PoseBust` (or `third_party/PoseBust`) |
| Binary | `POSEBUST_BIN` or `posebust` on `PATH` or `$POSEBUST_ROOT/build/posebust` |

## Commands

```bash
node lp/bench/cli.mjs posebust
node lp/bench/cli.mjs posebust validate --pred ligand.sdf --protein receptor.pdb
```

Official CLI when built:

```text
posebust --native --pred ligand.sdf --protein receptor.pdb [-l crystal.sdf]
```

`--bust` (upstream PoseBusters Python) stays off unless `POSEBUST_ALLOW_BUST=1`. That is still score-only. It is not a GA `pb_clash` insert.

## Build (status prints this hint)

```bash
cmake -S ~/Projects/PoseBust -B ~/Projects/PoseBust/build
cmake --build ~/Projects/PoseBust/build
```

Pair with `$flexaidds` for DatasetRunner/Astex registry and `$bench` for arms/admit.
