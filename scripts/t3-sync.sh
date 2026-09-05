#!/usr/bin/env bash
# Fail-soft upstream sync for the LeBonhommePharma t3code fork.
# Same spirit as omp-sync: check / apply / rollback, never brick the install.
# Never writes ~/.t3/userdata. Never deletes ~/.t3code/bench session state.
# Extra files in LP skill dirs are merged, not wiped.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/t3-sync.sh --check | --apply | --rollback [snapshot-id] | --list | --install-skills

  --check            Dry-run. Fetch pingdotgg/t3code (read-only) and report
                     how far this checkout is behind/ahead of upstream main,
                     plus the latest GitHub release tag when the API is
                     reachable. Does not change git state, overlays, or skills.
  --apply            Snapshot → fetch → merge upstream → restore LP overlays
                     (bench plugin/skills) → reinstall skills (merge, no wipe)
                     → smoke tests. On failure, restore the snapshot and exit
                     non-zero. Refuses a dirty worktree.
  --rollback [id]    Restore the latest (or named) pre-sync snapshot.
  --list             Show kept snapshots (newest first).
  --install-skills   Copy FlexAIDDS / Shannon / bench / PoseBust skills into
                     user skill dirs. Merge-only: extra LP files are kept.
                     Does not merge git. Safe to re-run.

Environment:
  T3_SYNC_HOME             default: $HOME/.t3code  (NOT ~/.t3)
  T3_SYNC_SKILL_HOME       default: $HOME  (skill dest roots live under this)
  T3_SYNC_UPSTREAM_REMOTE  default: upstream
  T3_SYNC_UPSTREAM_URL     default: https://github.com/pingdotgg/t3code.git
  T3_SYNC_UPSTREAM_REF     default: main
  T3_SYNC_RELEASE_API      default: https://api.github.com/repos/pingdotgg/t3code/releases/latest
  T3_SYNC_KEEP             snapshots to retain (default: 8)
  T3_SYNC_SMOKE            1 to run extra pairing tests after apply (default: 0)
  T3_SYNC_FETCH_ATTEMPTS   default: 4
  T3_SYNC_FETCH_DELAY      initial backoff seconds (default: 4; 0 = no sleep)

Exit codes: 0 ok, 1 failed (snapshot restored when apply/rollback can), 2 network.

This script never bricks an install by wiping LP config, ~/.t3, or
~/.t3code/bench. Overlays listed in lp/overlays.manifest always win after merge.
EOF
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T3_SYNC_HOME="${T3_SYNC_HOME:-${HOME}/.t3code}"
T3_SYNC_SKILL_HOME="${T3_SYNC_SKILL_HOME:-${HOME}}"
UPSTREAM_REMOTE="${T3_SYNC_UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${T3_SYNC_UPSTREAM_URL:-https://github.com/pingdotgg/t3code.git}"
UPSTREAM_REF="${T3_SYNC_UPSTREAM_REF:-main}"
RELEASE_API="${T3_SYNC_RELEASE_API:-https://api.github.com/repos/pingdotgg/t3code/releases/latest}"
KEEP="${T3_SYNC_KEEP:-8}"
FETCH_ATTEMPTS="${T3_SYNC_FETCH_ATTEMPTS:-4}"
FETCH_DELAY="${T3_SYNC_FETCH_DELAY:-4}"
LOG_DIR="${T3_SYNC_HOME}/logs"
SNAP_DIR="${T3_SYNC_HOME}/sync-snapshots"
LOCK_FILE="${T3_SYNC_HOME}/t3-sync.lock"
MANIFEST="${ROOT}/lp/overlays.manifest"
SKILL_NAMES=(flexaidds shannon bench posebust)
LOG_FILE="/dev/null"
LOCK_DIR=""

log() {
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '%s %s\n' "${ts}" "$*" | tee -a "${LOG_FILE}"
}

die() {
  log "error: $*"
  exit 1
}

network_die() {
  log "error: $*"
  log "Network failed. Nothing was merged. Retry when you are online."
  exit 2
}

userdata_guard() {
  local path="$1"
  case "${path}" in
    "${HOME}/.t3" | "${HOME}/.t3/"* | */.t3/userdata | */.t3/userdata/*)
      die "refusing to use ${path}: this tool never writes ~/.t3 or userdata"
      ;;
  esac
}

ensure_dirs() {
  userdata_guard "${T3_SYNC_HOME}"
  userdata_guard "${T3_SYNC_SKILL_HOME}"
  mkdir -p "${LOG_DIR}" "${SNAP_DIR}" "${T3_SYNC_HOME}/bench"
}

release_lock() {
  if [[ -n "${LOCK_DIR}" && -d "${LOCK_DIR}" ]]; then
    rm -rf "${LOCK_DIR}"
  fi
}

acquire_lock() {
  mkdir -p "${T3_SYNC_HOME}"
  if command -v flock >/dev/null 2>&1; then
    exec 9>"${LOCK_FILE}"
    if ! flock -n 9; then
      die "another t3-sync is running (lock ${LOCK_FILE})"
    fi
    return
  fi
  # macOS has no flock(1). mkdir is atomic; stale locks from dead PIDs are dropped.
  LOCK_DIR="${LOCK_FILE}.d"
  if mkdir "${LOCK_DIR}" 2>/dev/null; then
    echo "$$" >"${LOCK_DIR}/pid"
    trap release_lock EXIT INT TERM HUP
    return
  fi
  local pid
  pid="$(cat "${LOCK_DIR}/pid" 2>/dev/null || true)"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    die "another t3-sync is running (pid ${pid}, lock ${LOCK_DIR})"
  fi
  log "removing stale lock ${LOCK_DIR}"
  rm -rf "${LOCK_DIR}"
  mkdir "${LOCK_DIR}" || die "could not acquire lock ${LOCK_DIR}"
  echo "$$" >"${LOCK_DIR}/pid"
  trap release_lock EXIT INT TERM HUP
}

require_git_repo() {
  git -C "${ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not a git checkout: ${ROOT}"
}

require_clean_worktree() {
  if [[ -n "$(git -C "${ROOT}" status --porcelain)" ]]; then
    die "worktree is dirty. commit or stash first so sync can roll back cleanly."
  fi
}

overlay_paths() {
  if [[ ! -f "${MANIFEST}" ]]; then
    printf '%s\n' lp scripts/t3-sync.sh scripts/t3-update.sh docs/PAIRING.md
    return
  fi
  grep -vE '^[[:space:]]*(#|$)' "${MANIFEST}"
}

skill_dest_roots() {
  printf '%s\n' \
    "${T3_SYNC_SKILL_HOME}/.agents/skills" \
    "${T3_SYNC_SKILL_HOME}/.claude/skills" \
    "${T3_SYNC_SKILL_HOME}/.cursor/skills"
}

ensure_upstream_remote() {
  if git -C "${ROOT}" remote get-url "${UPSTREAM_REMOTE}" >/dev/null 2>&1; then
    return
  fi
  log "adding remote ${UPSTREAM_REMOTE} -> ${UPSTREAM_URL}"
  git -C "${ROOT}" remote add "${UPSTREAM_REMOTE}" "${UPSTREAM_URL}"
}

fetch_upstream() {
  local attempt delay
  delay="${FETCH_DELAY}"
  attempt=1
  while [[ "${attempt}" -le "${FETCH_ATTEMPTS}" ]]; do
    if git -C "${ROOT}" fetch --quiet "${UPSTREAM_REMOTE}" "${UPSTREAM_REF}"; then
      return 0
    fi
    log "fetch failed (attempt ${attempt}/${FETCH_ATTEMPTS})"
    if [[ "${attempt}" -eq "${FETCH_ATTEMPTS}" ]]; then
      network_die "could not fetch ${UPSTREAM_REMOTE}/${UPSTREAM_REF}"
    fi
    if [[ "${delay}" -gt 0 ]]; then
      sleep "${delay}"
      delay=$((delay * 2))
    fi
    attempt=$((attempt + 1))
  done
}

current_sha() {
  git -C "${ROOT}" rev-parse HEAD
}

upstream_sha() {
  git -C "${ROOT}" rev-parse "${UPSTREAM_REMOTE}/${UPSTREAM_REF}"
}

unique_local_commits() {
  git -C "${ROOT}" rev-list --count "${UPSTREAM_REMOTE}/${UPSTREAM_REF}..HEAD"
}

behind_commits() {
  git -C "${ROOT}" rev-list --count "HEAD..${UPSTREAM_REMOTE}/${UPSTREAM_REF}"
}

prune_snapshots() {
  local count=0
  local dir
  while IFS= read -r dir; do
    [[ -n "${dir}" ]] || continue
    count=$((count + 1))
    if [[ "${count}" -gt "${KEEP}" ]]; then
      log "pruning old snapshot ${dir}"
      rm -rf "${dir}"
    fi
  done < <(ls -1dt "${SNAP_DIR}"/*/ 2>/dev/null || true)
}

snapshot_id_now() {
  printf '%s-%s\n' "$(date -u +"%Y%m%dT%H%M%SZ")" "${RANDOM:-$$}"
}

copy_tree() {
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "${dest}")"
  if [[ -d "${src}" ]]; then
    mkdir -p "${dest}"
    cp -a "${src}/." "${dest}/"
  else
    cp -a "${src}" "${dest}"
  fi
}

create_snapshot() {
  local id="$1"
  local dest="${SNAP_DIR}/${id}"
  mkdir -p "${dest}/overlays" "${dest}/user-skills"
  git -C "${ROOT}" rev-parse HEAD >"${dest}/HEAD"
  git -C "${ROOT}" status --porcelain >"${dest}/status.txt"
  git -C "${ROOT}" branch --show-current >"${dest}/branch"
  {
    echo "created=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "head=$(current_sha)"
    echo "branch=$(git -C "${ROOT}" branch --show-current || true)"
    echo "rollback: git -C ${ROOT} reset --hard $(current_sha)"
    echo "then restore overlays from ${dest}/overlays if needed"
    echo "this does not touch ~/.t3 or ${T3_SYNC_HOME}/bench"
  } >"${dest}/ROLLBACK.txt"
  git -C "${ROOT}" tag -f "t3-sync/pre-${id}" HEAD >/dev/null 2>&1 || true
  local path
  while IFS= read -r path; do
    [[ -n "${path}" ]] || continue
    if [[ -e "${ROOT}/${path}" ]]; then
      copy_tree "${ROOT}/${path}" "${dest}/overlays/${path}"
    fi
  done < <(overlay_paths)
  local name root dest_skill
  for name in "${SKILL_NAMES[@]}"; do
    while IFS= read -r root; do
      dest_skill="${root}/${name}"
      if [[ -d "${dest_skill}" ]]; then
        copy_tree "${dest_skill}" "${dest}/user-skills/${name}/$(basename "${root}")"
      fi
    done < <(skill_dest_roots)
  done
  log "snapshot ${id} at ${dest}"
  printf '%s\n' "${id}"
}

latest_snapshot_id() {
  ls -1dt "${SNAP_DIR}"/*/ 2>/dev/null | head -1 | xargs -n1 basename || true
}

restore_overlays_from() {
  local dest="$1"
  local path
  while IFS= read -r path; do
    [[ -n "${path}" ]] || continue
    if [[ -e "${dest}/overlays/${path}" ]]; then
      mkdir -p "${ROOT}/$(dirname "${path}")"
      rm -rf "${ROOT}/${path}"
      copy_tree "${dest}/overlays/${path}" "${ROOT}/${path}"
      log "restored overlay ${path}"
    fi
  done < <(overlay_paths)
}

restore_user_skills_from() {
  local dest="$1"
  local name root dest_skill snap_skill
  for name in "${SKILL_NAMES[@]}"; do
    while IFS= read -r root; do
      dest_skill="${root}/${name}"
      snap_skill="${dest}/user-skills/${name}/$(basename "${root}")"
      if [[ -d "${snap_skill}" ]]; then
        mkdir -p "${dest_skill}"
        cp -a "${snap_skill}/." "${dest_skill}/"
        log "restored user skill ${dest_skill}"
      fi
    done < <(skill_dest_roots)
  done
}

restore_snapshot() {
  local id="$1"
  local dest="${SNAP_DIR}/${id}"
  [[ -d "${dest}" ]] || die "snapshot not found: ${id}"
  local sha
  sha="$(cat "${dest}/HEAD")"
  log "rolling back HEAD to ${sha}"
  git -C "${ROOT}" reset --hard "${sha}"
  restore_overlays_from "${dest}"
  restore_user_skills_from "${dest}"
  log "rollback complete. bench state at ${T3_SYNC_HOME}/bench was not touched."
  log "T3 userdata (~/.t3) was not touched."
}

install_skills() {
  local name src dest root
  for name in "${SKILL_NAMES[@]}"; do
    src="${ROOT}/.agents/skills/${name}"
    [[ -d "${src}" ]] || continue
    while IFS= read -r root; do
      dest="${root}/${name}"
      userdata_guard "${dest}"
      mkdir -p "${dest}"
      # Merge, do not rm -rf: extra LP files in the dest stay put.
      cp -a "${src}/." "${dest}/"
      log "installed skill ${name} -> ${dest} (merge, extras kept)"
    done < <(skill_dest_roots)
  done
}

report_latest_release() {
  local json tag sha url published
  if ! command -v curl >/dev/null 2>&1; then
    log "latest release: skipped (no curl)"
    return 0
  fi
  if ! json="$(curl -fsSL --connect-timeout 3 --max-time 20 -H "Accept: application/vnd.github+json" "${RELEASE_API}" 2>/dev/null)"; then
    log "latest release: unavailable (network); git comparison above still stands"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    tag="$(printf '%s' "${json}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tag_name",""))' 2>/dev/null || true)"
    sha="$(printf '%s' "${json}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("target_commitish",""))' 2>/dev/null || true)"
    url="$(printf '%s' "${json}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("html_url",""))' 2>/dev/null || true)"
    published="$(printf '%s' "${json}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("published_at",""))' 2>/dev/null || true)"
  else
    tag="$(printf '%s' "${json}" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    url=""
    sha=""
    published=""
  fi
  if [[ -z "${tag}" ]]; then
    log "latest release: response had no tag_name; ignoring"
    return 0
  fi
  log "latest release ${tag} ${published} ${url}"
  if [[ -n "${sha}" ]]; then
    log "release target ${sha}"
  fi
  if git -C "${ROOT}" rev-parse -q --verify "refs/tags/${tag}" >/dev/null 2>&1; then
    local behind_rel
    behind_rel="$(git -C "${ROOT}" rev-list --count "HEAD..${tag}" 2>/dev/null || echo "?")"
    log "vs release tag ${tag}: ${behind_rel} commit(s) not in HEAD (0 means this checkout contains that tag)"
  else
    log "release tag ${tag} is not fetched locally; --apply uses ${UPSTREAM_REMOTE}/${UPSTREAM_REF}, not a reinstall of the .dmg"
  fi
}

cmd_check() {
  require_git_repo
  ensure_dirs
  ensure_upstream_remote
  fetch_upstream
  local head up behind ahead
  head="$(current_sha)"
  up="$(upstream_sha)"
  behind="$(behind_commits)"
  ahead="$(unique_local_commits)"
  log "checkout ${ROOT}"
  log "HEAD     ${head}"
  log "upstream ${up} (${UPSTREAM_REMOTE}/${UPSTREAM_REF})"
  log "behind   ${behind} commit(s)"
  log "ahead    ${ahead} fork-only commit(s)"
  report_latest_release
  if [[ "${behind}" -eq 0 ]]; then
    log "already up to date with ${UPSTREAM_REMOTE}/${UPSTREAM_REF}"
  else
    log "run: scripts/t3-sync.sh --apply"
  fi
  overlay_paths | while IFS= read -r path; do
    if [[ -e "${ROOT}/${path}" ]]; then
      log "overlay ok  ${path}"
    else
      log "overlay MISSING ${path}"
    fi
  done
  log "bench state ${T3_SYNC_HOME}/bench (never deleted by sync)"
  log "T3 userdata is not this tool's business"
}

cmd_apply() {
  require_git_repo
  ensure_dirs
  require_clean_worktree
  ensure_upstream_remote
  fetch_upstream
  local behind
  behind="$(behind_commits)"
  local id
  id="$(snapshot_id_now)"
  create_snapshot "${id}" >/dev/null
  echo "${id}" >"${T3_SYNC_HOME}/last-snapshot"
  if [[ "${behind}" -eq 0 ]]; then
    log "already up to date; restoring overlays and skills anyway"
    restore_overlays_from "${SNAP_DIR}/${id}"
    install_skills
    prune_snapshots
    return 0
  fi
  local ahead
  ahead="$(unique_local_commits)"
  log "merging ${UPSTREAM_REMOTE}/${UPSTREAM_REF} (${behind} incoming, ${ahead} local-only)"
  if ! git -C "${ROOT}" merge --no-edit "${UPSTREAM_REMOTE}/${UPSTREAM_REF}"; then
    log "merge failed; aborting and restoring snapshot ${id}"
    git -C "${ROOT}" merge --abort >/dev/null 2>&1 || true
    restore_snapshot "${id}"
    die "merge conflict. snapshot ${id} restored. inspect and retry."
  fi
  restore_overlays_from "${SNAP_DIR}/${id}"
  install_skills
  if ! smoke_after_apply; then
    log "smoke failed; restoring snapshot ${id}"
    restore_snapshot "${id}"
    die "smoke tests failed; snapshot ${id} restored"
  fi
  prune_snapshots
  log "apply succeeded. snapshot ${id} kept for --rollback"
  log "if lockfile/deps changed, run: vp i"
}

smoke_after_apply() {
  local failed=0
  if [[ -f "${ROOT}/lp/bench/bench.test.mjs" ]]; then
    if ! (cd "${ROOT}" && node --test lp/bench/bench.test.mjs); then
      failed=1
    fi
  fi
  if [[ "${T3_SYNC_SMOKE:-0}" == "1" ]]; then
    if command -v vp >/dev/null 2>&1; then
      if ! (cd "${ROOT}" && vp test run \
        packages/client-runtime/src/connection/errors.test.ts \
        apps/web/src/components/settings/ConnectionsSettings.logic.test.ts \
        apps/server/src/cli/pair.test.ts); then
        failed=1
      fi
    fi
  fi
  return "${failed}"
}

cmd_rollback() {
  require_git_repo
  ensure_dirs
  require_clean_worktree
  local id="${1:-}"
  if [[ -z "${id}" ]]; then
    if [[ -f "${T3_SYNC_HOME}/last-snapshot" ]]; then
      id="$(cat "${T3_SYNC_HOME}/last-snapshot")"
    else
      id="$(latest_snapshot_id)"
    fi
  fi
  [[ -n "${id}" ]] || die "no snapshot to roll back to"
  restore_snapshot "${id}"
}

cmd_list() {
  ensure_dirs
  local dir id
  local found=0
  while IFS= read -r dir; do
    [[ -n "${dir}" ]] || continue
    found=1
    id="$(basename "${dir}")"
    if [[ -f "${dir}/HEAD" ]]; then
      log "snapshot ${id} head=$(cat "${dir}/HEAD") created=$(sed -n 's/^created=//p' "${dir}/ROLLBACK.txt" 2>/dev/null | head -1)"
    else
      log "snapshot ${id}"
    fi
  done < <(ls -1dt "${SNAP_DIR}"/*/ 2>/dev/null || true)
  if [[ "${found}" -eq 0 ]]; then
    log "no snapshots in ${SNAP_DIR}"
  fi
}

cmd_install_skills() {
  ensure_dirs
  install_skills
}

main() {
  case "${1:-}" in
    -h | --help | "")
      usage
      [[ -n "${1:-}" ]] || exit 1
      exit 0
      ;;
  esac
  ensure_dirs
  local stamp
  stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  LOG_FILE="${LOG_DIR}/t3-sync-${stamp}.log"
  ln -sfn "${LOG_FILE}" "${LOG_DIR}/latest.log"
  acquire_lock
  cd "${ROOT}"
  case "${1}" in
    --check)
      cmd_check
      ;;
    --apply)
      cmd_apply
      ;;
    --rollback)
      shift || true
      cmd_rollback "${1:-}"
      ;;
    --list)
      cmd_list
      ;;
    --install-skills)
      cmd_install_skills
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
