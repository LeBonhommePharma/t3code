---
name: shannon
description: Shannon hub/gate skill for T3 Code. Use /shannon or $shannon. Points at ~/Projects/Shannon. Collapse referee fail-opens unless SHANNON_GATE_LIVE=1.
---

# Shannon (t3code adapter)

Do not copy Shannon's full hub skill into T3. This pack tells T3 agents where Shannon lives and how the bench referee behaves.

Composer: `$shannon` / `/shannon`. Claude extra: `.claude/commands/shannon.md`.

## Root

`~/Projects/Shannon` (`SHANNON_ROOT`). Read that repo's own `skills/shannon/SKILL.md` when you are actually operating the hub.

```bash
node lp/bench/cli.mjs shannon
node lp/bench/cli.mjs status
```

## Referee

The collapse referee in `lp/bench/referee.mjs`:

- **Default:** `SHANNON_GATE_LIVE` unset → **fail-open stub** (reads and writes allowed, marked `live: false`).
- **Live:** `SHANNON_GATE_LIVE=1` → call Shannon `python3 -m agent_manager monitor ...` from `SHANNON_ROOT`. Write/launchish actions (`write-results`, `launchish`, `admit`) **fail closed** if the gate is unreachable or denies.

## When to gate

- Planning or reading bench status: allowed in the stub.
- `admit`, writing result CSVs, or launchish campaign starts: require a live gate when the human asked for Shannon enforcement.

## Pair with FlexAIDDS

Use `$flexaidds` for arms/standdown/CSV/DatasetRunner inspect. Use `$posebust` for native pose checks. Use `$shannon` when the work must report through the Shannon pill/gate instead of freelancing a second orchestrator.
