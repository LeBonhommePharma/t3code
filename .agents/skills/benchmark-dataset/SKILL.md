---
name: benchmark-dataset
description: FlexAIDDS benchmark dataset registry and protocols. Use for Astex Diverse/Non-Native paths, YAML slugs, BENCHMARK_STANDARD, and admission_metrics_contract. Read-only. 2HR7 is canary-only (84 of canonical 85). Slash: /benchmark-dataset or $benchmark-dataset.
---

# Benchmark dataset (read-only)

Assets live under `~/Projects/FlexAIDdS` (`FLEXAIDDS_ROOT`).

```bash
node lp/bench/cli.mjs dataset registry
```

| Asset | Path under FlexAIDDS |
| --- | --- |
| Standard | `benchmarks/BENCHMARK_STANDARD.md` |
| Admission contract | `benchmarks/protocols/admission_metrics_contract.md` |
| Astex 85 manifest | `benchmarks/protocols/astex85_target_manifest.json` |
| Astex YAML manifest | `benchmarks/datasets/astex_diverse_manifest.json` |
| Native 85 JSON | `benchmarks/datasets/benchmark_astex_native_85.json` |
| Canonical Astex tree | `benchmarks/astex_diverse/astex_diverse/` |
| Registry YAMLs | `benchmarks/datasets/*.yaml` (astex_diverse, astex_nonnative, casf2016, itc187, …) |
| Canonical note | `benchmarks/datasets/CANONICAL.md` |
| Exclusions | `benchmarks/protocols/science_exclusions.md` |

Do not launch the 85-target set from T3. 2HR7 is canary-only (84 of canonical 85). `$dataset-runner` for the runner CLI. `$bench` / `$admit` / `$rank12` for campaign arms.
