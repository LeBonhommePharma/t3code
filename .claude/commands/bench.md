---
description: FlexAIDDS/Shannon/PoseBust bench CLI (arms, admit, rank12, dataset, posebust, status)
argument-hint: "[arms|admit|rank12|dataset|posebust|status]"
---

Run the t3code fork bench CLI from this checkout. Read-only defaults. Do not launch 85-target docking. Do not write Science sqlite. 2HR7 is canary-only.

If `$ARGUMENTS` is empty, print status. Otherwise pass the arguments through:

```bash
node lp/bench/cli.mjs $ARGUMENTS
```
