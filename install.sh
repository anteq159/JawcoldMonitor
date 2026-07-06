#!/usr/bin/env bash
# JawcoldMonitor - instalacja jedną komendą (Raspberry Pi OS / Debian):
#
#   curl -fsSL https://raw.githubusercontent.com/anteq159/JawcoldMonitor/main/install.sh | bash
#
# Co robi: instaluje Dockera (jeśli brak), klonuje repozytorium do
# ~/JawcoldMonitor, generuje .env z losowym SECRET_KEY i hasłem bazy,
# wykrywa adapter RS485 i uruchamia aplikację. Ponowne uruchomienie
# skryptu jest bezpieczne - istniejący .env i dane nie są nadpisywane.
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
    # W tej sesji grupa jeszcze nie działa - używamy sudo dla komend docker.
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
    log "Klonuję repozytorium do $INSTALL_DIR..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# --- .env ---
if [ -f .env ]; then
    log "Plik .env już istnieje - nie zmieniam go."
else
    log "Generuję .env (losowy SECRET_KEY i hasło bazy)..."
    SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    DBPASS="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"

    # Wykryj adapter RS485 (pierwszy ttyUSB/ttyACM); brak = zostaje domyślny
    PORT="/dev/ttyUSB0"
    for p in /dev/ttyUSB* /dev/ttyACM*; do
        [ -e "$p" ] && PORT="$p" && break
    done

    # Adres, pod którym panel będzie otwierany (CORS)
    IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    ORIGINS="http://localhost"
    [ -n "$IP" ] && ORIGINS="http://localhost,http://$IP"

    sed -e "s|^SECRET_KEY=.*|SECRET_KEY=$SECRET|" \
        -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$DBPASS|" \
        -e "s|^RS485_PORTS=.*|RS485_PORTS=$PORT|" \
        -e "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=$ORIGINS|" \
        .env.example > .env
    log "Wykryty port RS485: $PORT"
fi

# --- Start ---
COMPOSE_FILES="-f docker-compose.yml"
if ls /dev/ttyUSB* /dev/ttyACM* >/dev/null 2>&1; then
    COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.prod.yml"
    log "Adapter RS485 wykryty - start w trybie produkcyjnym."
else
    warn "Brak adaptera RS485 - start bez mapowania portu (podepnij adapter i uruchom skrypt ponownie)."
fi

log "Buduję i uruchamiam kontenery (pierwszy raz na Pi może potrwać kilkanaście minut)..."
$DOCKER compose $COMPOSE_FILES up -d --build

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
log "Gotowe! Panel: http://${IP:-localhost}"
log "Logowanie: admin / admin (system wymusi zmianę hasła)."
log "Dalsza konfiguracja (powiadomienia, kopie, alarmy): zakładka Ustawienia w panelu."
