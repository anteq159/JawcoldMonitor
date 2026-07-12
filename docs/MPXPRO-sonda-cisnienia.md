# MPXPRO — podłączenie i konfiguracja sondy ciśnienia (0–5 V ratiometryczna)

Instrukcja dla podłączenia elektronicznej sondy ciśnienia CAREL do wejścia
S6/DI3 **lub** S7/DI4 sterownika MPXPRO (schemat „Pressure probe connection"
z instrukcji CAREL +0300055PL, rozdz. 2/4/5/6).

> **Ważne:** MPXPRO obsługuje **tylko JEDNĄ** sondę logarytmiczną
> (ratiometryczną) 0–5 V — podłącz ją do S6 **albo** S7, nigdy do obu.
> Konfiguracja sondy ciśnienia jest dostępna w modelach z driverem
> elektronicznego zaworu rozprężnego (EEV).

## 1. Okablowanie (kabel CAREL SPKC003310 lub SPKC005310)

| Zacisk | Funkcja  | Kolor żyły |
|--------|----------|------------|
| 28     | 5 Vdc    | czarny     |
| 29     | S7/DI4   | biały      |
| 30     | GND      | zielony    |
| 31     | S6/DI3   | biały      |

- Sonda na **S6**: żyły do zacisków 31 (sygnał), 30 (GND), 28 (5 Vdc).
- Sonda na **S7**: żyły do zacisków 29 (sygnał), 30 (GND), 28 (5 Vdc).
- **Zalecane wejście: S6** — jest domyślnym wejściem ciśnienia parowania
  w MPXPRO (w modelach z driverem EEV fabrycznie /FE=6).
- Sondę montować możliwie blisko lady/parownika, którym steruje MPXPRO.

## 2. Zakres sondy (do parametrów /L6//U6 lub /L7//U7)

| Kod CAREL      | Min (barg) | Maks (barg) | Uwagi                       |
|----------------|-----------:|------------:|-----------------------------|
| SPKT0053R0     | −1,0       | 4,2         |                             |
| SPKT0013R0     | −1,0       | 9,3         | = wartości fabryczne /L6//U6 |
| SPKT0043R0     | 0,0        | 17,3        |                             |
| SPKT0033R0     | 0,0        | 34,5        |                             |
| SPKT00B6R0     | 0,0        | 45,0        |                             |
| SPKT0011S0 (*) | −1,0       | 9,3         |                             |
| SPKT0041S0 (*) | 0,0        | 17,3        |                             |
| SPKT0031S0 (*) | 0,0        | 34,5        |                             |
| SPKT00B1S0 (*) | 0,0        | 45,0        |                             |
| SPKT00G1S0 (*) | 0,0        | 60,0        |                             |

(*) możliwy montaż bez rurki kapilarnej.

## 3. Parametry sterownika (klawiatura MPXPRO)

Parametry typu **A (zaawansowane)** — wejście w programowanie: przytrzymaj
`Prg/mute` + `SET` ~5 s, wprowadź **hasło 33** (parametry konfiguracyjne C:
hasło 22). Po zmianie zatwierdzaj `SET`.

### Sonda na S6 (zalecane)

| Parametr | Wartość | Znaczenie |
|----------|---------|-----------|
| `/P3`    | **4**   | typ czujnika grupy 3 (S6): czujnik logarytmiczny 0–5 V |
| `/L6`    | wg tabeli | minimalna wartość zakresu sondy (np. −1,0 dla SPKT0013R0) |
| `/U6`    | wg tabeli | maksymalna wartość zakresu sondy (np. 9,3 dla SPKT0013R0) |
| `/FE`    | **6**   | pomiar ciśnienia parowania PEu przypisany do czujnika S6 |
| `PH`     | wg czynnika | typ czynnika chłodniczego — konieczny do przeliczeń tEu/przegrzania: 1=R22, 2=R134a, **3=R404A (fabryczne)**, 4=R407C, 5=R410A, 6=R507A, 7=R290, 8=R600, 9=R600a, 10=R717, 11=R744, 12=R728, 13=R1270, 14=R417A, 15=R422D, 16=R413A, 17=R422A, 18=R423A, 19=R407A… |
| `/c6`    | 0 (opcjonalnie) | kalibracja/korekcja odczytu S6 |

### Sonda na S7 (alternatywa)

| Parametr | Wartość | Znaczenie |
|----------|---------|-----------|
| `/P4`    | **4**   | typ czujnika grupy 4 (S7): czujnik logarytmiczny 0–5 V (S7 obsługuje też 5 = 0–10 V i 6 = 4–20 mA — czujniki aktywne z własnym zasilaniem, NIE z zacisku 28) |
| `/L7`    | wg tabeli | minimalna wartość zakresu sondy |
| `/U7`    | wg tabeli | maksymalna wartość zakresu sondy |
| `/FE`    | **7**   | pomiar ciśnienia parowania PEu przypisany do czujnika S7 |
| `PH`     | wg czynnika | jak wyżej |
| `/c7`    | 0 (opcjonalnie) | kalibracja/korekcja odczytu S7 |

Uwaga (sieć Master/Slave): jedną sondę ciśnienia podłączoną do Mastera mogą
współdzielić sterowniki Slave — na Masterze ustaw `/FE`, `/L6`, `/U6`,
na Slave'ach `/FE=0` (odczyt propagowany po tLAN).

## 4. Panel JawcoldMonitor

Wejścia S6/S7 są już w profilu „Carel MPX" jako rejestry **„Sonda 6"**
(adres 12) i **„Sonda 7"** (adres 13) — po skonfigurowaniu sterownika wartość
ciśnienia pojawi się tam automatycznie przy najbliższym cyklu skanowania
(surowa wartość ÷10, czyli w barach).

1. Wejdź w **Urządzenia → MPXPro → Zmienne sterownika**.
2. Nadaj zmiennej „Sonda 6" (lub „Sonda 7") **alias**, np.
   „Ciśnienie parowania [bar]".
3. Oznacz zmienną **gwiazdką** — od wersji 1.18.2 dashboard pokazuje
   w Ulubionych parametrach nazwę z aliasu, nie surową nazwę rejestru.

> Dopóki sonda nie jest podłączona/skonfigurowana, rejestr pokazuje wzorzec
> „czujnik niepodłączony" (ok. −204,8 / −812,8) — to normalne.
> Po fizycznym podłączeniu sondy warto zweryfikować odczyt na panelu
> z wartością na wyświetlaczu sterownika; jednostka w profilu (°C dla
> wejść sondowych) może wtedy zostać skorygowana na „bar" dla tego wejścia.
