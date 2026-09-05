---
name: admit
description: Admit a FlexAIDDS bench arm if standdown allows. Use /admit or $admit with an arm id (pool-native, claim-ready, canary-2hr7). Refuses 85-launch, new search arms, GA pb_clash, and non-SCORE_NATIVE lanes. 2HR7 is canary-only.
---

# admit

```bash
node lp/bench/cli.mjs admit <arm>
node lp/bench/cli.mjs admit canary-2hr7
```

Shannon live gate (`SHANNON_GATE_LIVE=1`) fail-closes write/admit if the hub is down. Default is a fail-open stub. Pair `$bench` and `$shannon`.
