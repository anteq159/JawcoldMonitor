# JawcoldMonitor

System monitoringu chłodnictwa na Raspberry Pi: sterowniki chłodnicze po RS485
(Modbus RTU — Carel, Danfoss, Eliwell), czujniki temperatury Dallas DS18B20
(1-Wire), alarmy progowe i sprzętowe, wykresy historyczne, mapy obiektu,
eksporty i role użytkowników.

Stack: FastAPI + PostgreSQL + Redis (backend), React + Vite (frontend),
całość w Dockerze.

---

## 1. Wymagany sprzęt

- **Raspberry Pi 4** (min. 2 GB RAM) z kartą microSD **klasy A1/A2, min. 32 GB**
  (jakość karty ma realne znaczenie — to najczęstszy punkt awarii).
- **Adapter USB ↔ RS485** (np. na układzie CH340 lub FT232). Po podłączeniu
  pojawia się jako `/dev/ttyUSB0`.
- **Czujniki DS18B20** (opcjonalnie) podłączone do GPIO4 (1-Wire) z rezystorem
  podciągającym 4,7 kΩ do 3,3 V. W `raspi-config` włącz interfejs 1-Wire.
- Zasilacz oryginalny 5 V/3 A — spadki napięcia powodują błędy transmisji
  i uszkodzenia karty SD.

### Okablowanie magistrali RS485

- Skrętka (najlepiej ekranowana), żyły **A → A** i **B → B** przez wszystkie
  urządzenia szeregowo (topologia magistrali, **bez odgałęzień gwiazdy**).
  U części producentów A/B bywa opisane jako D+/D- lub odwrotnie — jeśli brak
  komunikacji, w pierwszej kolejności zamień A z B.
- **Terminator 120 Ω** na obu **końcach** magistrali (tylko na końcach!).
  Część sterowników i adapterów ma terminator wbudowany, załączany zworką
  lub przełącznikiem DIP.
- Wspólna masa (GND) między adapterem a sterownikami, jeśli producent ją
  wyprowadza — redukuje błędy przy dłuższych trasach.
- Maksymalna praktyczna długość magistrali przy 9600 baud: setki metrów;
  unikaj prowadzenia równolegle z kablami siłowymi.

### Adresacja sterowników

- Każdy sterownik na magistrali musi mieć **unikalny adres Modbus (1–247)**.
  Adres ustawia się w parametrach serwisowych sterownika (np. Carel: `H0`,
  Eliwell: `dEA/FAA`, Danfoss: `o03`).
- Automatyczne wykrywanie skanuje adresy **1–32** (zmienna
  `DISCOVERY_MAX_ADDRESS`) — trzymaj się tego zakresu albo zwiększ zmienną.
- Wszystkie urządzenia na jednej magistrali muszą mieć te same parametry
  transmisji (domyślnie **9600 baud, 8N1**).

---

## 2. Instalacja

### Przygotowanie karty SD

1. Wgraj **Raspberry Pi OS Lite (64-bit)** przez Raspberry Pi Imager
   (ustaw od razu hostname, użytkownika, WiFi/ethernet i SSH).
2. Po pierwszym uruchomieniu:

```bash
sudo apt update && sudo apt full-upgrade -y
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # przeloguj się po tej komendzie
```

3. Dla czujników DS18B20: `sudo raspi-config` → Interface Options → 1-Wire → Enable.

### Uruchomienie aplikacji

```bash
git clone https://github.com/anteq159/JawcoldMonitor.git
cd JawcoldMonitor
cp .env.example .env
nano .env
```

W `.env` **koniecznie** ustaw:

| Zmienna | Opis |
|---|---|
| `DB_PASSWORD` | silne, losowe hasło bazy danych |
| `SECRET_KEY` | losowy ciąg min. 32 znaki (`openssl rand -hex 32`) — **aplikacja produkcyjna nie wystartuje z domyślnym** |
| `RS485_PORTS` | port adaptera, zwykle `/dev/ttyUSB0` |
| `ALLOWED_ORIGINS` | adres, pod którym otwierasz panel, np. `http://192.168.1.50` |

Start (tryb produkcyjny, z realnym sprzętem):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Panel: `http://<adres-pi>` (port 80). Tryb demonstracyjny bez sprzętu:
`PREVIEW_MODE=true` w `.env` i sam `docker compose up -d`.

---

## 3. Pierwsze uruchomienie

1. Zaloguj się: **admin / admin** — system od razu **wymusi zmianę hasła**.
2. Przejdzie Cię **kreator pierwszej konfiguracji** (port RS485, skan
   magistrali). Można go uruchomić ponownie z zakładki Ustawienia.
3. Wykryte sterowniki pojawią się w zakładce **Sterowniki**; urządzenia
   nierozpoznane oznaczane są żółtą plakietką — przypisz im profil ręcznie
   lub w zakładce **Konfiguracja** utwórz własny profil rejestrów.
4. Załóż konta pracowników w **Użytkownicy** i nadaj role (patrz niżej).

---

## 4. Role i uprawnienia

| Rola | Do czego służy |
|---|---|
| **Admin** | wszystko: użytkownicy, konfiguracja profili, kopie, aktualizacje |
| **Serwisant** | codzienna obsługa: dodawanie/edycja urządzeń, zapis nastaw, reguły i potwierdzanie alarmów, eksporty |
| **Viewer** | tylko podgląd odczytów, wykresów i logów |

Własne role z dowolnym zestawem uprawnień tworzy się w zakładce
**Role i uprawnienia**. Uprawnienia egzekwuje backend — ukrywanie przycisków
w interfejsie jest tylko ułatwieniem.

---

## 5. Alarmy i powiadomienia

- **Reguły progowe** (Alerty → Reguły): próg lub zakres min/max na dowolnym
  parametrze urządzenia/czujnika, z kategorią i ważnością.
- **Alarmy sprzętowe**: kody alarmów raportowane przez sam sterownik
  (np. awaria sondy) — logowane i wyświetlane automatycznie.
- **Alarmy systemowe**: urządzenie offline dłużej niż `OFFLINE_ALARM_MINUTES`
  (domyślnie 5 min; 0 wyłącza) oraz zapełnienie dysku powyżej
  `DISK_ALARM_PERCENT` (domyślnie 90%).

### Powiadomienia e-mail / Telegram

Konfiguracja w `.env` (po zmianie: `docker compose restart backend`):

```bash
# E-mail (SMTP)
SMTP_HOST=smtp.twojafirma.pl
SMTP_PORT=587
SMTP_USER=alarmy@twojafirma.pl
SMTP_PASSWORD=haslo
SMTP_FROM=alarmy@twojafirma.pl
ALERT_EMAIL_TO=serwis@twojafirma.pl,kierownik@twojafirma.pl

# Telegram (bot utworzony przez @BotFather; chat_id grupy lub osoby)
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=-100123456789

# Które kanały mają dostawać alarmy systemowe i sprzętowe
NOTIFY_SYSTEM_CHANNELS=email,telegram
```

W regule progowej zaznacza się, którymi kanałami ma być wysyłana
(pole „Powiadomienia" przy tworzeniu reguły). Błąd wysyłki nigdy nie
zatrzymuje monitoringu — trafia do logów.

---

## 6. Kopie zapasowe

- **Ręczna**: Ustawienia → Kopie zapasowe (pobranie/przywrócenie pliku JSON —
  obejmuje sterowniki, profile, czujniki i reguły alarmowe).
- **Automatyczna**: w `.env`:

```bash
BACKUP_AUTO_ENABLED=true
BACKUP_INTERVAL_HOURS=24
BACKUP_DIR=/backups          # patrz montowanie niżej
BACKUP_RETENTION_COUNT=14    # ile ostatnich plików trzymać
```

Aby kopie lądowały **poza kartą SD** (pendrive/udział sieciowy), zamontuj
nośnik na hoście i podepnij go do kontenera w `docker-compose.prod.yml`:

```yaml
  backend:
    volumes:
      - /mnt/usb-backup:/backups
```

Każda automatyczna kopia (i ewentualny błąd) zapisuje się w Logach zdarzeń.

---

## 7. Aktualizacje

Ustawienia → Aktualizacje → wgraj plik `updates/<wersja>.zip` z tego
repozytorium. Aplikacja instaluje paczkę, wykonuje migracje bazy i restartuje
się; dostępne jest wycofanie do wersji sprzed aktualizacji (rollback).

---

## 8. Bezpieczeństwo / HTTPS

- `SECRET_KEY` z wartością domyślną **blokuje start** w trybie produkcyjnym.
- Hasła: pierwsze logowanie wymusza zmianę; logowanie ma limit prób.
- WebSocket i całe API wymagają zalogowania.
- **HTTPS**: wystaw aplikację przez reverse proxy z certyfikatem. Najprościej
  [Caddy](https://caddyserver.com) na tym samym Pi:

```
# /etc/caddy/Caddyfile — zaufany certyfikat wymaga publicznej domeny;
# w sieci lokalnej Caddy użyje własnego CA (tls internal)
monitoring.twojafirma.pl {
    reverse_proxy localhost:80
}
```

Przy dostępie zdalnym rozważ VPN (WireGuard/Tailscale) zamiast wystawiania
panelu do internetu.

---

## 9. Rozwiązywanie problemów

| Objaw | Co sprawdzić |
|---|---|
| Brak portu `/dev/ttyUSB0` | `ls /dev/ttyUSB*`, `dmesg \| tail` po wpięciu adaptera; inne przejściówki potrafią zgłosić się jako `ttyACM0` — popraw `RS485_PORTS` |
| Urządzenia nie odpowiadają | zamień żyły A/B; terminatory; wspólny baud; unikalne adresy; zasilanie sterowników |
| Losowe przekłamania odczytów | brak terminatorów, topologia gwiazdy, kabel równolegle do siłowych |
| Czujniki DS18B20 niewidoczne | włączony 1-Wire w raspi-config; `ls /sys/bus/w1/devices/` powinno pokazać `28-...` |
| Panel nie działa | `docker compose ps`, `docker compose logs backend --tail 50`; health check: `http://<pi>/api/v1/health` |
| Diagnostyka z UI | zakładka **Diagnostyka** (Admin) — status usług, RS485, błędy aplikacji |

---

## Struktura repozytorium

```
backend/     FastAPI, sterowniki urządzeń (app/drivers/), migracje Alembic
frontend/    React + Vite
docker/      nginx (serwuje frontend, proxy /api i /ws)
updates/     paczki aktualizacji do wgrania przez UI
database/    init.sql
```
