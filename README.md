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

### Uruchomienie aplikacji — jedna komenda

```bash
curl -fsSL https://raw.githubusercontent.com/anteq159/JawcoldMonitor/main/install.sh | bash
```

Skrypt sam: instaluje Dockera (jeśli brak), klonuje repozytorium do
`~/JawcoldMonitor`, generuje `.env` z **losowym `SECRET_KEY` i hasłem bazy**,
wykrywa adapter RS485 i uruchamia aplikację. Ponowne uruchomienie skryptu jest
bezpieczne (aktualizuje repo, nie nadpisuje `.env` ani danych).

Panel: `http://<adres-pi>` (port 80). Po zalogowaniu wszystkie ustawienia
robocze (interwały skanowania, alarmy, powiadomienia, kopie zapasowe, port
RS485) zmienia się w zakładce **Ustawienia → Konfiguracja systemu** — plik
`.env` to tylko wartości startowe.

<details>
<summary>Instalacja ręczna (bez skryptu)</summary>

```bash
git clone https://github.com/anteq159/JawcoldMonitor.git
cd JawcoldMonitor
cp .env.example .env
nano .env   # ustaw DB_PASSWORD, SECRET_KEY (openssl rand -hex 32), RS485_PORTS, ALLOWED_ORIGINS
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Bez własnego `SECRET_KEY` aplikacja wygeneruje losowy przy pierwszym starcie
i zapisze go trwale w bazie. Tryb
demonstracyjny bez sprzętu: `PREVIEW_MODE=true` i sam `docker compose up -d`.
</details>

### Port panelu WWW

Panel domyślnie działa na porcie **80** (`http://<adres-pi>`). Port można
zmienić na dwa sposoby:

- w pliku `.env` — wpis `PANEL_PORT=8080`, potem
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`,
- z panelu — **Ustawienia → Konfiguracja systemu → Sieć → Port panelu WWW**;
  zapis trafia do `.env` na hoście, a nowy port zaczyna działać po wykonaniu
  na Raspberry `cd ~/JawcoldMonitor && docker compose -f docker-compose.yml
  -f docker-compose.prod.yml up -d` (albo po ponownym uruchomieniu
  `install.sh`). Aplikacja nie może sama przełączyć portu, bo mapowanie
  portów wykonuje Docker przy tworzeniu kontenera.

> **Uwaga:** na instalacji produkcyjnej zawsze podawaj oba pliki `-f`.
> Samo `docker compose up -d` odtworzy backend **bez** zmapowanego portu
> RS485 (`devices:` jest tylko w `docker-compose.prod.yml`) i wszystkie
> sterowniki będą pokazywać się jako offline.

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

## 4. Co jest w panelu

| Zakładka | Do czego służy |
|---|---|
| **Pulpit** | przegląd instalacji: kafelki stanu, ulubione parametry, obciążenie Raspberry (CPU / RAM / temperatura / dysk), szybkie akcje |
| **Sterowniki** | lista podłączonych urządzeń i szczegóły każdego z nich |
| **Czujniki** | czujniki 1-Wire DS18B20 (niezależne od magistrali RS485) |
| **Trendy** | porównywanie przebiegów z wielu urządzeń i czujników na jednym wykresie |
| **Mapa** | rzut obiektu lub schemat obiegu z żywymi wartościami (patrz niżej) |
| **Alerty** | reguły progowe, historia zdarzeń, potwierdzanie alarmów |
| **Konfiguracja** | profile rejestrów sterowników (własne i wbudowane) |
| **Użytkownicy**, **Role i uprawnienia** | konta i uprawnienia |
| **Logi zdarzeń**, **Diagnostyka** | historia operacji, stan usług, błędy aplikacji |
| **Ustawienia** | konfiguracja systemu, kopie zapasowe, aktualizacje |

### Ulubione parametry

Gwiazdka przy urządzeniu lub przy pojedynczej zmiennej dodaje ją do
**ulubionych** — trafia wtedy na widżet na Pulpicie. Ulubione są zapisywane
**na koncie użytkownika**, więc każdy widzi swój własny zestaw (maks. 32).

### Wartości na kafelku listy sterowników

Kafelek każdego sterownika na liście może pokazywać **do 3 wybranych
wartości**, zanim w ogóle wejdziesz w urządzenie. Ustawia się je ikoną ołówka
w zakładce **Sterowniki**; wybór dotyczy danego sterownika i jest wspólny dla
wszystkich użytkowników. Bez wyboru kafelek pokazuje pierwszy dostępny odczyt.

### Aliasy, jednostki i widoczność zmiennych

W szczegółach sterownika, w karcie **Zmienne sterownika**, ikona ołówka włącza
tryb edycji, w którym dla **tego jednego urządzenia** można:

- **ukryć** zmienną (znika z listy, wykresów i bieżących wartości),
- **zmienić nazwę** (alias) — odczyty i zapisy nadal używają prawdziwej nazwy
  rejestru, zmienia się tylko etykieta,
- **zmienić jednostkę** — potrzebne, gdy fizyczny sens wejścia zależy od
  konfiguracji samego sterownika. Typowy przypadek: sonda ciśnieniowa na
  wejściu S6/S7 sterownika Carel MPXPRO zamiast sondy temperatury (°C → bar).
  Pełna instrukcja podłączenia i konfiguracji: [`docs/MPXPRO-sonda-cisnienia.md`](docs/MPXPRO-sonda-cisnienia.md).

Profil rejestrów i pozostałe urządzenia korzystające z tego samego profilu
pozostają nietknięte.

### Wykres historyczny

W szczegółach sterownika wykres obejmuje zakresy 1h / 6h / 24h / 7d / 30d.
Ikona suwaków nad wykresem pozwala **wyłączyć i włączyć poszczególne dane** —
wybór jest zapamiętany dla tego sterownika i nie ukrywa wartości w pozostałych
miejscach panelu. Serie można też przełączać doraźnie, klikając w legendę.

### Mapa obiektu i schemat obiegu

Zakładka **Mapa** obsługuje dwa rodzaje podkładu:

- **Mapa z obrazu** — wgraj rzut kondygnacji (PNG/JPG) i rozstaw na nim pinezki
  urządzeń; każda pokazuje na żywo do 3 wybranych parametrów.
- **Schemat obiegu** — rysowany w panelu schemat instalacji: linie ortogonalne
  w czterech kolorach (tłoczenie / ssanie / ciecz / neutralny), strzałki
  kierunku przepływu, etykiety tekstowe i kafelki z żywymi wartościami.

Obie formy aktualizują wartości na bieżąco przez WebSocket.

### Eksporty

Odczyty i historię alarmów można wyeksportować do **CSV, JSON, XLSX i PDF**
(wymaga uprawnienia `export:any`). Bardzo duże zakresy są odrzucane z
komunikatem — zawęź przedział czasu, wskaż konkretne urządzenie albo użyj CSV,
który ma najwyższy limit.

---

## 5. Role i uprawnienia

| Rola | Do czego służy |
|---|---|
| **Admin** | wszystko: użytkownicy, konfiguracja profili, kopie, aktualizacje |
| **Serwisant** | codzienna obsługa: dodawanie/edycja urządzeń, zapis nastaw, reguły i potwierdzanie alarmów, eksporty |

Własne role z dowolnym zestawem uprawnień tworzy się w zakładce
**Role i uprawnienia**. Uprawnienia egzekwuje backend — ukrywanie przycisków
w interfejsie jest tylko ułatwieniem.

---

## 6. Alarmy i powiadomienia

- **Reguły progowe** (Alerty → Reguły): próg lub zakres min/max na dowolnym
  parametrze urządzenia/czujnika, z kategorią i ważnością.
- **Alarmy sprzętowe**: kody alarmów raportowane przez sam sterownik
  (np. awaria sondy) — logowane i wyświetlane automatycznie.
- **Alarmy systemowe**: urządzenie offline dłużej niż `OFFLINE_ALARM_MINUTES`
  (domyślnie 5 min; 0 wyłącza) oraz zapełnienie dysku powyżej
  `DISK_ALARM_PERCENT` (domyślnie 90%).

### Powiadomienia e-mail / Telegram

Konfiguracja w panelu: **Ustawienia → Konfiguracja systemu** (działa od razu,
bez restartu). Te same wartości można podać z góry w `.env` jako wartości
startowe:

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

## 7. Kopie zapasowe

- **Ręczna**: Ustawienia → Kopie zapasowe (pobranie/przywrócenie pliku JSON —
  obejmuje sterowniki, profile, czujniki i reguły alarmowe).
- **Automatyczna**: włączana w **Ustawienia → Konfiguracja systemu**
  (lub startowo w `.env`):

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

## 8. Aktualizacje

- **Backend** (logika, sterowniki, migracje): Ustawienia → Aktualizacje →
  wgraj plik `updates/<wersja>.zip` z tego repozytorium. Aplikacja instaluje
  paczkę, wykonuje migracje bazy i restartuje się; dostępny jest rollback.
- **Frontend (interfejs)**: paczki .zip go **nie** obejmują — interfejs jest
  wbudowany w obraz Dockera przy instalacji. Aby zaktualizować interfejs,
  uruchom ponownie komendę instalacyjną na Raspberry (bezpieczne — pobiera
  nowy kod i przebudowuje kontenery, nie ruszając `.env` ani danych):

```bash
curl -fsSL https://raw.githubusercontent.com/anteq159/JawcoldMonitor/main/install.sh | bash
```

---

## 9. Bezpieczeństwo / HTTPS

- `SECRET_KEY`: jeśli nie ustawisz własnego, przy pierwszym starcie generowany
  jest losowy klucz i zapisywany trwale w bazie — instalacja prosto z GitHuba
  jest od razu bezpieczna. Własny klucz w `.env` zawsze ma pierwszeństwo.
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

## 10. Rozwiązywanie problemów

| Objaw | Co sprawdzić |
|---|---|
| Brak portu `/dev/ttyUSB0` | `ls /dev/ttyUSB*`, `dmesg \| tail` po wpięciu adaptera; inne przejściówki potrafią zgłosić się jako `ttyACM0` — popraw `RS485_PORTS` |
| Urządzenia nie odpowiadają | zamień żyły A/B; terminatory; wspólny baud; unikalne adresy; zasilanie sterowników. **Carel MPXPRO wymaga 2 bitów stopu** — ustaw `RS485_STOPBITS=2`, bez tego nie odpowiadają mimo poprawnego okablowania |
| Wszystkie urządzenia nagle offline | czy backend wystartował z oboma plikami `-f`? Samo `docker compose up -d` odtwarza kontener bez dostępu do portu RS485 |
| Karta SD się zapełnia | `READINGS_RETENTION_DAYS` (patrz niżej) — domyślnie 90 dni historii odczytów |
| Losowe przekłamania odczytów | brak terminatorów, topologia gwiazdy, kabel równolegle do siłowych |
| Czujniki DS18B20 niewidoczne | włączony 1-Wire w raspi-config; `ls /sys/bus/w1/devices/` powinno pokazać `28-...` |
| Panel nie działa | `docker compose ps`, `docker compose logs backend --tail 50`; health check: `http://<pi>/api/v1/health` |
| Diagnostyka z UI | zakładka **Diagnostyka** (Admin) — status usług, RS485, błędy aplikacji |

---

## 11. Wybrane zmienne środowiskowe

Pełna lista z komentarzami jest w `.env.example`. Większość z nich zmienia się
też z panelu (**Ustawienia → Konfiguracja systemu**) bez restartu — poniżej te,
o których najłatwiej zapomnieć:

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `READINGS_RETENTION_DAYS` | `90` | ile dni historii odczytów trzymać. **Decyduje o zapełnieniu karty SD** — przy krótkim interwale skanowania i wielu sterownikach historia rośnie szybko |
| `KNOWN_SCAN_INTERVAL` | `10` | co ile sekund odpytywane są znane urządzenia. Pojedynczy sterownik może mieć własny interwał (ikona zegara w jego szczegółach) |
| `RS485_STOPBITS` | `1` | liczba bitów stopu; **Carel MPXPRO wymaga `2`** |
| `RS485_PORTS` | `/dev/ttyUSB0` | port adaptera RS485; niektóre przejściówki zgłaszają się jako `/dev/ttyACM0` |
| `DISCOVERY_MAX_ADDRESS` | `32` | do jakiego adresu Modbus sięga automatyczne wykrywanie |
| `OFFLINE_ALARM_MINUTES` | `5` | po ilu minutach ciszy urządzenie wywołuje alarm (`0` wyłącza) |
| `DISK_ALARM_PERCENT` | `90` | próg alarmu zapełnienia dysku |
| `BACKUP_DIR` | `backups` | katalog kopii zapasowych. Ścieżka **względna** jest wewnątrz kontenera — do montowania nośnika użyj ścieżki bezwzględnej (np. `/backups`), zgodnie z przykładem w sekcji 7 |

---

## Struktura repozytorium

```
backend/     FastAPI, sterowniki urządzeń (app/drivers/), migracje Alembic
frontend/    React + Vite; nginx.conf (serwuje frontend, proxy /api i /ws)
updates/     paczki aktualizacji do wgrania przez UI
database/    init.sql
docs/        instrukcje serwisowe (m.in. sonda ciśnienia na Carel MPXPRO)
install.sh   instalacja jedną komendą
docker-compose.yml + .prod.yml / .preview.yml   warianty uruchomienia
```
