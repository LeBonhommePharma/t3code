---
name: rank12
description: Rank the top 12 SCORE_NATIVE rows from a FlexAIDDS Astex V2 CSV. Use /rank12 or $rank12. Default CSV ~/flexaidds_results/astex_v2.csv (FLEXAIDDS_RESULTS).
---

# rank12

```bash
node lp/bench/cli.mjs rank12
node lp/bench/cli.mjs rank12 ~/flexaidds_results/astex_v2.csv
node lp/bench/cli.mjs deck
```

`deck` prints a CONFLICT banner if a row sets more than one of hung / pool / claim_ready. Does not launch docking.
