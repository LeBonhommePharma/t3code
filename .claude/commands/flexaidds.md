---
description: FlexAIDDS campaign inspect (arms, standdown, DatasetRunner status, Astex registry). Read-only defaults.
argument-hint: "[status|arms|dataset|standdown]"
---

If `$ARGUMENTS` is empty, print status. Otherwise pass through:

```bash
node lp/bench/cli.mjs $ARGUMENTS
```

Do not launch 85-target docking. No Science sqlite writes. 2HR7 is canary-only.
