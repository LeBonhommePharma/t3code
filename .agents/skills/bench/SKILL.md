---
name: bench
description: T3 Code first-party FlexAIDDS/Shannon/PoseBust bench CLI. Use for arms, compare, standdown, admit, rank12, deck, dataset, posebust, status, and session glue. Prefers same-repo lp/bench over omp extensions.
---

# bench

Entry point: `node lp/bench/cli.mjs`. Composer: `$bench`, `$flexaidds`, `$shannon`, `$posebust`.

Enable on this machine:

```bash
scripts/t3-sync.sh --install-skills
```

That copies those skills into `~/.agents/skills`, `~/.claude/skills`, and `~/.cursor/skills` so every provider T3 scans can see them. Merge-only: extra LP files in those dirs are kept. It does not touch `~/.t3/userdata`.

See `$flexaidds` for DatasetRunner / Astex registry, `$posebust` for native pose checks, `$shannon` for the gate.
