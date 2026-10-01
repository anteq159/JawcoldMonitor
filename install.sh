#!/usr/bin/env bash
# JawcoldMonitor - instalacja jedną komendą (Raspberry Pi OS / Debian):
#
#   curl -fsSL https://raw.githubusercontent.com/anteq159/JawcoldMonitor/main/install.sh | bash
#
# Co robi: instaluje Dockera (jeśli brak), pobiera repozytorium do
# ~/JawcoldMonitor, generuje .env z losowym SECRET_KEY i hasłem bazy,
# wykrywa adapter RS485, pobiera gotowe obrazy i uruchamia aplikację.
# Ponowne uruchomienie jest bezpieczne i działa jak aktualizacja -
# istniejący .env i dane nie są nadpisywane.
set -euo pipefail

REPO_URL="https://github.com/anteq159/JawcoldMonitor.git"
INSTALL_DIR="${JAWCOLD_DIR:-$HOME/JawcoldMonitor}"

log() { echo -e "\033[1;32m[jawcold]\033[0m $*"; }
warn() { echo -e "\033[1;33m[jawcold]\033[0m $*"; }

# --- Docker ---
if ! command -v docker >/dev/null 2>&1; then
    log "Instaluję Dockera..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    warn "Dodano $USER do grupy docker - po zakończeniu instalacji przeloguj się."
    DOCKER="sudo docker"
else
    if docker info >/dev/null 2>&1; then DOCKER="docker"; else DOCKER="sudo docker"; fi
fi

# --- Repozytorium ---
if [ -d "$INSTALL_DIR/.git" ]; then
    log "Repozytorium już istnieje - aktualizuję ($INSTALL_DIR)..."
    git -C "$INSTALL_DIR" pull --ff-only || warn "Nie udało się pobrać zmian - kontynuuję z obecną wersją."
else
    if ! command -v git >/dev/null 2>&1; then
        log "Instaluję gita..."
        sudo apt-get update -qq && sudo apt-get install -y -qq git
    fi
    log "Pobieram repozytorium do $INSTALL_DIR..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# --- .env ---
detect_port() {
    # Stable by-id path first: /dev/ttyACM0 can become ttyACM1 after the
    # adapter is re-plugged, the by-id name never changes. On multi-port
    # adapters the first interface (if00) is taken.
    local p
    for p in /dev/serial/by-id/*; do
        [ -e "$p" ] && { echo "$p"; return; }
    done
    for p in /dev/ttyUSB* /dev/ttyACM*; do
        [ -e "$p" ] && { echo "$p"; return; }
    done
    echo "/dev/ttyUSB0"
}

if [ -f .env ]; then
    log "Plik .env już istnieje - nie zmieniam go."
else
    log "Generuję .env (losowy SECRET_KEY i hasło bazy)..."
    SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    DBPASS="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    PORT="$(detect_port)"
    IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    ORIGINS="http://localhost"
    [ -n "$IP" ] && ORIGINS="http://localhost,http://$IP"

    sed -e "s|^SECRET_KEY=.*|SECRET_KEY=$SECRET|" \
        -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$DBPASS|" \
        -e "s|^RS485_PORTS=.*|RS485_PORTS=$PORT|" \
        -e "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=$ORIGINS|" \
        .env.example > .env
    log "Port RS485: $PORT (zmienisz w Ustawienia → Konfiguracja systemu)"
fi

# Bind-mounted directories must exist and belong to this user before
# Docker would create them as root.
mkdir -p backend/uploads backend/backups

# --- Start ---
log "Pobieram obrazy aplikacji..."
if ! $DOCKER compose pull; then
    warn "Gotowe obrazy niedostępne - buduję lokalnie (pierwszy raz na Pi kilkanaście minut)..."
    $DOCKER compose build
fi
$DOCKER compose up -d --remove-orphans

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
PANEL_PORT="$(grep -E '^PANEL_PORT=' .env 2>/dev/null | head -1 | cut -d= -f2)"
PORT_SUFFIX=""
[ -n "$PANEL_PORT" ] && [ "$PANEL_PORT" != "80" ] && PORT_SUFFIX=":$PANEL_PORT"
log "Gotowe! Panel: http://${IP:-localhost}${PORT_SUFFIX}"
log "Logowanie: admin / admin (system wymusi zmianę hasła)."
log "Aktualizacja w przyszłości: $INSTALL_DIR/scripts/jawcold update"
