#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/guanghe}"
APP_USER="${APP_USER:-www}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-codex/aliyun-guanghe-deploy}"
PM2_APP_NAME="${PM2_APP_NAME:-guanghe}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3001/api/health}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-30}"
HEALTHCHECK_INTERVAL_SEC="${HEALTHCHECK_INTERVAL_SEC:-2}"
LOCK_DIR="${LOCK_DIR:-/tmp/guanghe-auto-deploy.lock.d}"
LOG_FILE="${LOG_FILE:-/www/wwwdata/guanghe/logs/auto-deploy.log}"

printf -v APP_DIR_Q '%q' "$APP_DIR"
printf -v REMOTE_NAME_Q '%q' "$REMOTE_NAME"
printf -v DEPLOY_BRANCH_Q '%q' "$DEPLOY_BRANCH"
printf -v PM2_APP_NAME_Q '%q' "$PM2_APP_NAME"
printf -v REMOTE_BRANCH_Q '%q' "${REMOTE_NAME}/${DEPLOY_BRANCH}"

mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1

timestamp() {
  date '+%F %T'
}

log() {
  echo "[$(timestamp)] $*"
}

run_as_app() {
  local command="$1"
  su -s /bin/bash - "$APP_USER" -c "$command"
}

run_in_app_dir() {
  local command="$1"
  run_as_app "cd ${APP_DIR_Q} && ${command}"
}

mark_runtime_paths_skip_worktree() {
  local path
  for path in ".env" "data/accounts.json" "data/accounts.json.bak.20260313-123636"; do
    run_in_app_dir "git ls-files --error-unmatch ${path@Q} >/dev/null 2>&1 && git update-index --skip-worktree ${path@Q} || true"
  done
}

wait_for_healthcheck() {
  local attempt
  for ((attempt = 1; attempt <= HEALTHCHECK_RETRIES; attempt += 1)); do
    if curl -fsS "$HEALTHCHECK_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$HEALTHCHECK_INTERVAL_SEC"
  done
  return 1
}

acquire_lock() {
  local start_ts now_ts holder_pid
  start_ts="$(date +%s)"

  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    holder_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    if [[ -n "$holder_pid" ]] && ! kill -0 "$holder_pid" 2>/dev/null; then
      rm -rf "$LOCK_DIR"
      continue
    fi

    now_ts="$(date +%s)"
    if (( now_ts - start_ts >= 900 )); then
      log "deploy lock wait timeout: $LOCK_DIR"
      exit 1
    fi
    sleep 2
  done

  echo "$$" > "$LOCK_DIR/pid"
  trap 'rm -rf "$LOCK_DIR"' EXIT
}

main() {
  acquire_lock
  mark_runtime_paths_skip_worktree

  local current_sha target_sha
  current_sha="$(run_in_app_dir 'git rev-parse HEAD')"
  run_in_app_dir "git fetch --prune ${REMOTE_NAME_Q} ${DEPLOY_BRANCH_Q}"
  target_sha="$(run_in_app_dir "git rev-parse ${REMOTE_BRANCH_Q}")"

  if [[ "$current_sha" == "$target_sha" ]]; then
    log "no new commit on ${DEPLOY_BRANCH}: ${current_sha}"
    exit 0
  fi

  log "updating ${DEPLOY_BRANCH}: ${current_sha} -> ${target_sha}"
  run_in_app_dir "git checkout ${DEPLOY_BRANCH_Q} >/dev/null 2>&1 || git checkout -B ${DEPLOY_BRANCH_Q} ${REMOTE_BRANCH_Q}"
  run_in_app_dir "git pull --ff-only ${REMOTE_NAME_Q} ${DEPLOY_BRANCH_Q}"
  run_in_app_dir 'npm ci --no-fund --no-audit'
  run_in_app_dir 'npm run build'
  run_as_app "pm2 restart ${PM2_APP_NAME_Q} --update-env"
  run_as_app 'pm2 save'

  if ! wait_for_healthcheck; then
    log "healthcheck failed: ${HEALTHCHECK_URL}"
    run_as_app "pm2 status ${PM2_APP_NAME_Q}"
    exit 1
  fi

  log "deploy finished for ${target_sha}"
}

main "$@"
