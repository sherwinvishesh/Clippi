#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# run_server_on_brev.sh
#
# 1. Syncs local code to the Brev A100 instance (clippi-sam-2)
# 2. Starts the FastAPI + MCP server on Brev in the background
# 3. Opens an SSH tunnel: localhost:8000 → clippi-sam-2:8000
# 4. Streams live server logs to your terminal
#
# Usage:
#   ./run_server_on_brev.sh            # start server + open tunnel + stream logs
#   ./run_server_on_brev.sh --stop     # kill the server on Brev
#   ./run_server_on_brev.sh --logs     # just tail the logs (tunnel must be open)
# ─────────────────────────────────────────────────────────────────────────────

REMOTE="clippi-sam-2"
REMOTE_DIR="~/clippi-backend"
PORT=8000

# ── Colour helpers ────────────────────────────────────────────────────────────
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[$(date '+%H:%M:%S')]${RESET} $*"; }
ok()   { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $*${RESET}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $*${RESET}"; }
fail() { echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $*${RESET}"; }
sep()  { echo -e "${BOLD}─────────────────────────────────────────────────────${RESET}"; }

# ── --logs flag (just stream logs, no sync/restart) ───────────────────────────
if [[ "$1" == "--logs" ]]; then
    log "Streaming live logs from $REMOTE (Ctrl+C to stop)..."
    sep
    ssh -t $REMOTE "tail -n 80 -f $REMOTE_DIR/logs/server.log"
    exit 0
fi

# ── --stop flag ───────────────────────────────────────────────────────────────
if [[ "$1" == "--stop" ]]; then
    log "Stopping Clippi server on $REMOTE..."
    ssh $REMOTE "pkill -f 'uvicorn app.main:app' 2>/dev/null && echo 'Server stopped.' || echo 'Server was not running.'"
    exit 0
fi

sep
echo -e "${BOLD}  🎬  Clippi Brev Deploy  ${RESET}"
sep

# ── Sync code ─────────────────────────────────────────────────────────────────
log "Syncing code to $REMOTE:$REMOTE_DIR ..."
rsync -az --progress \
    --exclude 'venv' \
    --exclude '.git' \
    --exclude '__pycache__' \
    --exclude 'checkpoints' \
    --exclude 'sam2_repo' \
    --exclude 'outputs' \
    --exclude 'uploads' \
    --exclude '*.pyc' \
    ./ $REMOTE:$REMOTE_DIR/
ok "Sync complete"

# ── Ensure remote dirs exist ──────────────────────────────────────────────────
log "Ensuring remote directories exist..."
ssh $REMOTE "mkdir -p $REMOTE_DIR/backend/outputs $REMOTE_DIR/backend/uploads $REMOTE_DIR/backend/clips $REMOTE_DIR/logs"
ok "Remote dirs ready"

# ── Kill whatever is on port $PORT ────────────────────────────────────────────
log "Freeing port $PORT on $REMOTE..."
ssh $REMOTE "
    lsof -ti tcp:$PORT | xargs kill -9 2>/dev/null
    sleep 1
    true
"
ok "Port $PORT cleared"

# ── Install/update dependencies ───────────────────────────────────────────────
log "Installing/updating Python dependencies on $REMOTE..."
ssh $REMOTE "
    source $REMOTE_DIR/venv/bin/activate && \
    pip install -q -r $REMOTE_DIR/backend/requirements.txt && \
    echo 'deps_ok'
" | grep -q 'deps_ok' && ok "Dependencies up to date" || warn "Dependency install may have had warnings"

# ── Install SAM2 if not already present ───────────────────────────────────────
log "Checking SAM2 installation on $REMOTE..."
ssh $REMOTE "
    source $REMOTE_DIR/venv/bin/activate
    if python -c 'import sam2' 2>/dev/null; then
        echo 'sam2_ok'
    else
        echo 'SAM2 not found — installing from PyPI...'
        pip install -q sam2 && echo 'sam2_installed' || echo 'sam2_failed'
    fi
" | while IFS= read -r line; do
    case "$line" in
        sam2_ok)       ok "SAM2 already installed" ;;
        sam2_installed) ok "SAM2 installed successfully" ;;
        sam2_failed)   warn "SAM2 pip install failed — YOLO-only fallback will be used for vehicles/objects" ;;
        *)             echo "  $line" ;;
    esac
done

# ── Download SAM2 checkpoint if missing ───────────────────────────────────────
# Note: use single-quoted SSH heredoc so $HOME and $(...) expand on the REMOTE,
# not locally. The path has a space ("object optimizer") so it must be double-quoted
# on the remote side. CKPT_URL is hardcoded to avoid quoting issues.
log "Checking SAM2 checkpoint on $REMOTE..."
ssh $REMOTE 'CKPT="$HOME/clippi-backend/backend/object optimizer/checkpoints/sam2.1_hiera_large.pt"
    mkdir -p "$(dirname "$CKPT")"
    if [ -f "$CKPT" ]; then
        echo ckpt_ok
    else
        echo "Checkpoint not found — downloading (~900 MB, this may take a few minutes)..."
        wget -q --show-progress -O "$CKPT" "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt" && echo ckpt_downloaded || echo ckpt_failed
    fi' | while IFS= read -r line; do
    case "$line" in
        ckpt_ok)         ok "SAM2 checkpoint already present" ;;
        ckpt_downloaded) ok "SAM2 checkpoint downloaded — precise per-pixel tracking enabled" ;;
        ckpt_failed)     warn "Checkpoint download failed — YOLO-only fallback will be used" ;;
        *)               echo "  $line" ;;
    esac
done

# ── Stamp the log file so we know where this run starts ───────────────────────
ssh $REMOTE "
    echo '' >> $REMOTE_DIR/logs/server.log
    echo '════════════════════════════════════════' >> $REMOTE_DIR/logs/server.log
    echo 'SERVER START  $(date)' >> $REMOTE_DIR/logs/server.log
    echo '════════════════════════════════════════' >> $REMOTE_DIR/logs/server.log
"

# ── Start FastAPI server on Brev ──────────────────────────────────────────────
log "Starting FastAPI server on $REMOTE (port $PORT)..."
ssh $REMOTE "
    cd $REMOTE_DIR/backend && \
    source ../venv/bin/activate && \
    nohup uvicorn app.main:app --host 0.0.0.0 --port $PORT \
        > ../logs/server.log 2>&1 & disown
    sleep 5
    if pgrep -f 'uvicorn app.main:app' > /dev/null; then
        echo 'started_ok  PID:'\$(pgrep -f 'uvicorn app.main:app')
        curl -s http://localhost:$PORT/api/health || echo 'health_fail'
    else
        echo 'start_fail'
        tail -30 ../logs/server.log
    fi
" | while IFS= read -r line; do
    if [[ "$line" == started_ok* ]]; then
        ok "Server running — ${line#started_ok  }"
    elif [[ "$line" == "health_fail" ]]; then
        warn "Process running but /api/health check failed — see logs below"
    elif [[ "$line" == "start_fail" ]]; then
        fail "Server failed to start"; exit 1
    else
        echo "  $line"
    fi
done

# ── Open SSH tunnel in background ─────────────────────────────────────────────
log "Opening SSH tunnel  localhost:$PORT → $REMOTE:$PORT ..."
ssh -N -L ${PORT}:localhost:${PORT} $REMOTE &
TUNNEL_PID=$!

# Give the tunnel a moment to establish
sleep 1
if kill -0 $TUNNEL_PID 2>/dev/null; then
    ok "Tunnel open (PID $TUNNEL_PID)"
else
    fail "Tunnel failed to open"
    exit 1
fi

sep
echo -e "${GREEN}  Clippi is live at  ${BOLD}http://localhost:5173${RESET}"
echo -e "${CYAN}  To start the frontend:${RESET}  cd frontend && npm run dev"
echo -e "${YELLOW}  Press Ctrl+C to close the tunnel and stop streaming logs${RESET}"
sep
echo ""

# ── Trap: kill tunnel when user hits Ctrl+C ───────────────────────────────────
cleanup() {
    echo ""
    log "Closing tunnel (server keeps running on Brev)..."
    kill $TUNNEL_PID 2>/dev/null
    wait $TUNNEL_PID 2>/dev/null
    ok "Tunnel closed. Run './run_server_on_brev.sh --stop' to kill the server."
}
trap cleanup EXIT INT TERM

# ── Stream live server logs ───────────────────────────────────────────────────
log "Streaming live server logs from $REMOTE (Ctrl+C to stop)..."
sep
ssh $REMOTE "tail -n 40 -f $REMOTE_DIR/logs/server.log"
