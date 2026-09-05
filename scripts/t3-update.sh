#!/usr/bin/env bash
# Alias for scripts/t3-sync.sh (omp-sync-style auto-update).
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/t3-sync.sh" "$@"
