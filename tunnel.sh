#!/usr/bin/env bash
# 터널 킬스위치 — 백엔드(:9523) + 게이트웨이(:9500) + cloudflared 터널을 한 번에 제어
#
# 사용법:
#   ./tunnel.sh on        터널 켜기 (백엔드·게이트웨이 자동 기동 후 공개 URL 출력)
#   ./tunnel.sh off       터널만 끄기 (백엔드·게이트웨이는 유지)
#   ./tunnel.sh off --all 터널 + 백엔드 + 게이트웨이 전부 끄기
#   ./tunnel.sh status    실행 상태 + 현재 URL
#   ./tunnel.sh url       현재 공개 URL만 출력
#   ./tunnel.sh restart   껐다 켜기 (새 URL 발급)

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/.run"
mkdir -p "$RUN"

API_PORT=9523
GATEWAY_PORT=9500
CF_LOG="$RUN/cloudflared.log"
CF_PID="$RUN/cloudflared.pid"
URL_FILE="$RUN/tunnel-url.txt"

c_green() { printf "\033[32m%s\033[0m\n" "$1"; }
c_red()   { printf "\033[31m%s\033[0m\n" "$1"; }
c_dim()   { printf "\033[2m%s\033[0m\n" "$1"; }

port_pid() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; }

ensure_backend() {
  if [ -z "$(port_pid $API_PORT)" ]; then
    c_dim "백엔드 기동 (:$API_PORT)..."
    (cd "$ROOT" && API_PORT=$API_PORT nohup node apps/api/server.mjs >"$RUN/api.log" 2>&1 &)
    sleep 1
  fi
}

ensure_gateway() {
  if [ -z "$(port_pid $GATEWAY_PORT)" ]; then
    c_dim "게이트웨이 기동 (:$GATEWAY_PORT)..."
    (cd "$ROOT" && GATEWAY_PORT=$GATEWAY_PORT API_PORT=$API_PORT nohup node apps/gateway/server.mjs >"$RUN/gateway.log" 2>&1 &)
    sleep 1
  fi
}

tunnel_running() {
  [ -f "$CF_PID" ] && kill -0 "$(cat "$CF_PID")" 2>/dev/null
}

start_tunnel() {
  if tunnel_running; then
    c_green "이미 켜져 있습니다."
    echo "URL: $(cat "$URL_FILE" 2>/dev/null || echo '(확인 중)')"
    return
  fi
  ensure_backend
  ensure_gateway
  : > "$CF_LOG"
  c_dim "터널 시작 (cloudflared → :$GATEWAY_PORT)..."
  nohup cloudflared tunnel --url "http://localhost:$GATEWAY_PORT" --no-autoupdate >"$CF_LOG" 2>&1 &
  echo $! > "$CF_PID"

  # URL 대기 (최대 ~30초)
  local url=""
  for _ in $(seq 1 30); do
    url=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$CF_LOG" | head -1 || true)
    [ -n "$url" ] && break
    sleep 1
  done
  if [ -z "$url" ]; then
    c_red "터널 URL 발급 실패. 로그: $CF_LOG"; tail -5 "$CF_LOG"; exit 1
  fi
  echo "$url" > "$URL_FILE"
  c_green "✅ 터널 ON"
  echo "  공개 URL : $url"
  echo "  시민     : $url/"
  echo "  관제     : $url/officer"
  echo "  API      : $url/v1/health"
}

stop_tunnel() {
  if tunnel_running; then kill "$(cat "$CF_PID")" 2>/dev/null || true; fi
  pkill -f "cloudflared tunnel --url" 2>/dev/null || true
  rm -f "$CF_PID" "$URL_FILE"
  c_red "⛔ 터널 OFF"
  if [ "${1:-}" = "--all" ]; then
    [ -n "$(port_pid $GATEWAY_PORT)" ] && kill "$(port_pid $GATEWAY_PORT)" 2>/dev/null || true
    [ -n "$(port_pid $API_PORT)" ] && kill "$(port_pid $API_PORT)" 2>/dev/null || true
    c_red "⛔ 게이트웨이·백엔드도 종료"
  fi
}

status() {
  echo "── 상태 ──────────────────────────"
  [ -n "$(port_pid $API_PORT)" ]     && c_green "백엔드(:$API_PORT)     ● 실행" || c_red "백엔드(:$API_PORT)     ○ 중지"
  [ -n "$(port_pid $GATEWAY_PORT)" ] && c_green "게이트웨이(:$GATEWAY_PORT) ● 실행" || c_red "게이트웨이(:$GATEWAY_PORT) ○ 중지"
  if tunnel_running; then
    c_green "터널              ● 실행"
    echo "  URL: $(cat "$URL_FILE" 2>/dev/null || echo '(확인 중)')"
  else
    c_red "터널              ○ 중지"
  fi
}

case "${1:-}" in
  on|start)   start_tunnel ;;
  off|stop)   stop_tunnel "${2:-}" ;;
  restart)    stop_tunnel; sleep 1; start_tunnel ;;
  status|st)  status ;;
  url)        cat "$URL_FILE" 2>/dev/null || { c_red "터널이 꺼져 있습니다."; exit 1; } ;;
  *)
    echo "사용법: ./tunnel.sh {on|off [--all]|restart|status|url}"
    exit 1 ;;
esac
