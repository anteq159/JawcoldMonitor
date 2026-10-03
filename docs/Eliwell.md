# Eliwell przez Modbus RTU — podłączenie do JawcoldMonitor

Profile: **Eliwell** (IDPlus 961/971/974), **Eliwell IDNext**, **Eliwell EWPC 021**
(Konfiguracja → zakładka *Eliwell*). Ten opis dotyczy IDPlus — dla niego
mamy pełną dokumentację producenta (instrukcja *IDPlus Family*, 9MA10053,
rozdział „Modbus functions and resources”).

## 1. Najważniejsze: osobna linia 9600 b/s

IDPlus komunikuje się **wyłącznie z prędkością 9600 b/s** („the transmission
speed must be set at 9600 baud”). Carel MPXPRO pracuje na 19200 8N2, więc
**Eliwell i MPXPRO nie mogą być na tej samej parze przewodów**.

Rozwiązanie: podłącz Eliwelle do **innego portu adaptera RS485** (adapter WCH
w Raspberry ma 4 porty) i dodaj dla nich linię:

*Ustawienia → Konfiguracja → Linie RS485 → Dodaj linię*

| Pole | Wartość |
|---|---|
| Nazwa | np. „Eliwell — chłodnie” |
| Port | wybierz z listy (`/dev/serial/by-id/…-if02` = drugi port adaptera) |
| Gotowe ustawienia | **Eliwell (9600 8N1)** |

Parzystość i bity stopu linii muszą być takie same jak w sterownikach
(parametry `Pty` i `StP`, fabrycznie `n` i `1b` → 9600 **8N1**). Linie są
odczytywane równolegle, więc wolniejsza linia Eliwelli nie spowalnia MPXPRO.

## 2. Sprzęt

IDPlus ma tylko port **TTL** (ten sam, do którego wkłada się Copy Card).
Do magistrali RS485 potrzebny jest konwerter Eliwell **BusAdapter 150**
(albo 130/350) — wkładany kablem 5-żyłowym TTL do sterownika, z drugiej
strony zaciski RS485 (+, −, GND). Kabel magistrali: skrętka ekranowana
(np. Belden 8762), sterowniki połączone równolegle (szeregowo „od jednego do
drugiego”), do 1200 m przy 9600 b/s.

## 3. Ustawienia w sterowniku (menu parametrów, folder **Add**)

| Parametr | Ustaw | Znaczenie |
|---|---|---|
| `PtS` | **d** | protokół Modbus (fabrycznie `t` = Televis — wtedy sterownik nie odpowie!) |
| `FAA` | 0…14 | „rodzina” — starsza część adresu |
| `dEA` | 0…14 | numer w rodzinie — młodsza część adresu |
| `Pty` | **n** (lub E/o) | parzystość — taka sama jak w linii |
| `StP` | **1b** (lub 2b) | bity stopu — takie same jak w linii |

**Adres Modbus = FAA × 16 + dEA.** Przykład: FAA = 0, dEA = 1 → adres 1;
FAA = 1, dEA = 2 → adres 18. Adres **0 jest zarezerwowany** (rozgłoszeniowy) —
fabryczne FAA = 0, dEA = 0 trzeba zmienić. Po zmianie `Pty`/`StP`
sterownik trzeba **wyłączyć i włączyć** (zalecenie producenta).

## 4. Dodanie w panelu

*Sterowniki → Dodaj → Szukaj na: „Eliwell — chłodnie”* — nowe adresy pojawią
się na liście. Sterowniki obsługujące funkcję Modbus 43 przedstawiają się
jako **INVENSYS** — panel podpowie wtedy nazwę „Eliwell …”. Wybierz profil
**Eliwell** i dodaj. Jeśli wybierzesz linię, na której IDPlus nie może
pracować (np. 19200), formularz pokaże ostrzeżenie.

## 5. Co odczytujemy i jak

- Sondy AI1–AI3, nastawa `SEt`, różnica `diF`, stany (sprężarka,
  odszranianie, wentylatory, drzwi, AUX, czuwanie, nastawa ekonomiczna,
  wejścia DI) i alarmy (E1–E3, AH1/AL1, przegrzanie, drzwi, alarm zewnętrzny,
  ciśnienie, HACCP, koniec odszraniania czasem) — jako bity rejestrów z
  „Client table”.
- IDPlus przyjmuje wiadomości do 30 bajtów, więc panel czyta najwyżej 12
  rejestrów naraz, a **parametry pojedynczo** (instrukcja: „Read 1 single
  register for parameters”) — robi to automatycznie.
- Eliwell zapisuje tylko funkcją 16 (biuletyn techniczny nr 18). Zmiana
  nastawy z panelu sama przechodzi na funkcję 16, gdy sterownik odrzuci
  funkcję 6.

## 6. Gdy sterownik nie odpowiada

1. `PtS` = d? (najczęstsza przyczyna — fabrycznie jest Televis).
2. Adres ≠ 0 i zgodny z FAA × 16 + dEA.
3. Linia 9600 i ta sama parzystość/bity stopu co `Pty`/`StP`; po zmianie
   tych parametrów — restart zasilania sterownika.
4. Przewody + i − nie zamienione; na końcach długiej magistrali rezystor
   120 Ω.
5. *Diagnostyka* i widżet *Magistrala* na dashboardzie pokazują stan każdej
   linii („brak portu” = adapter odłączony lub zły port).

Źródła: Eliwell *IDPlus Family* 9MA10053 (Modbus functions and resources);
Eliwell Technical Support Bulletin nr 6 (Connectivity) i nr 18 (Modbus Tips).
