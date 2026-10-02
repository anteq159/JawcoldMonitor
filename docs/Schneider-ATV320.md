# Schneider Electric Altivar ATV320 — podłączenie do JawcoldMonitor

Profil **Schneider Electric ATV320** (Konfiguracja → zakładka *Schneider
Electric*) odczytuje z falownika przez wbudowany port Modbus RTU:

| Grupa | Zmienne |
|---|---|
| Pomiary | częstotliwość wyjściowa i zadana, prąd silnika, moment, moc, napięcie sieci, stan termiczny napędu |
| Stany | praca (napęd załączony) — bit 2 słowa statusu ETA |
| Alarmy | błąd napędu (bit 3 ETA), ostrzeżenie (bit 7 ETA) — każdy wywołuje alarm sterownika, wpis w logu i powiadomienie |
| Parametry | ostatni błąd (kod LFt), prędkość maks./min. (HSP/LSP), czasy rampy (ACC/dEC) |

Panel **tylko monitoruje** napęd. Start/stop i zadawanie prędkości przez
Modbus wymaga sekwencji słowa sterującego CiA402 (CMD), której pojedynczy
zapis z panelu nie wykona bezpiecznie. Zapis HSP/LSP/ACC/dEC można włączyć
w edytorze profilu (kolumna *Zapis*), jeśli serwis tego potrzebuje.

## Ustawienia w napędzie

Menu **CONF → FULL → COM → MODBUS NETWORK** (Conf → Full → Communication):

| Parametr | Wartość |
|---|---|
| `Add` — adres Modbus | unikalny na magistrali, 1–247 |
| `tbr` — prędkość | taka jak magistrala, np. **19.2** |
| `tFO` — format | taki jak magistrala; fabrycznie **8E1** |

Wszystkie urządzenia na jednej magistrali RS485 muszą mieć ten sam format.
Carel MPXPRO pracuje na stałe w **19200 8N2**, więc na wspólnej magistrali
ustaw w ATV320 `tFO = 8N2`. Jeśli na magistrali są same napędy ATV320
w ustawieniach fabrycznych, zamiast tego w panelu ustaw
**Ustawienia → Konfiguracja → RS485 → Parzystość = E** i bity stopu = 1
(zmiana wymaga restartu aplikacji).

Złącze Modbus ATV320 to gniazdo RJ45: D1 (B / D+) = pin 4,
D0 (A / D−) = pin 5, wspólny 0 V = pin 8. Jak przy każdym urządzeniu —
jeśli nie ma komunikacji, najpierw zamień A z B.

## Źródła adresów

- ATV320 Modbus manual NVE41308 (format magistrali, przykłady W3104 HSP i
  W9001 ACC, bity słowa statusu ETA),
- ATV32 Modbus manual S1A28698 (ta sama platforma: LCR = 3204, LFt = 7121),
- zmienne komunikacyjne rodziny Altivar (ETA 3201, rFr 3202, FrH 3203,
  Otr 3205, ULn 3207, tHd 3209, Opr 3211).

Pełna tabela parametrów (ATV320_CommunicationParameters, NVE41316) jest
dostępna na portalu Schneider Electric. Jeśli napięcie sieci pokazuje
~40 V zamiast ~400 V, zmień jego skalę z 0,1 na 1 w edytorze profilu.
