"""Factory register maps for built-in profiles - shared by the startup
seeding in main.py and the "Przywróć domyślne" endpoint."""

from typing import List, Optional

# Generic, vendor-agnostic starting templates for the Konfiguracja page's
# "Inne" tab - other common Modbus devices someone might monitor alongside
# refrigeration controllers (a site's energy meter, a pressure transducer
# on a compressor line). Not manufacturer/driver-backed like the profiles
# above: no real-world brand identity, no alarm register, so there's
# nothing for decode_active_alarms() to do with them and no mock
# simulation - a device assigned one of these needs its own real
# register values, this is a starting point to edit, not a demo device.
GENERIC_PROFILES = [
    {
        "name": "Licznik energii (ogólny)",
        "description": "Uniwersalny szablon licznika energii 3-fazowego - adresy przykładowe, dostosuj do konkretnego licznika.",
        "registers": [
            {"address": 0, "name": "Napięcie L1", "unit": "V", "data_type": "float32", "scale_factor": 1.0},
            {"address": 2, "name": "Napięcie L2", "unit": "V", "data_type": "float32", "scale_factor": 1.0},
            {"address": 4, "name": "Napięcie L3", "unit": "V", "data_type": "float32", "scale_factor": 1.0},
            {"address": 6, "name": "Prąd L1", "unit": "A", "data_type": "float32", "scale_factor": 1.0},
            {"address": 20, "name": "Moc czynna", "unit": "kW", "data_type": "float32", "scale_factor": 1.0},
            {"address": 40, "name": "Energia", "unit": "kWh", "data_type": "float32", "scale_factor": 1.0},
        ],
    },
    {
        "name": "Przetwornik ciśnienia (ogólny)",
        "description": "Uniwersalny szablon przetwornika ciśnienia (np. na linii ssawnej/tłocznej sprężarki) - adresy przykładowe.",
        "registers": [
            {"address": 0, "name": "Ciśnienie", "unit": "bar", "data_type": "int16", "scale_factor": 0.01},
            {"address": 1, "name": "Temperatura medium", "unit": "°C", "data_type": "int16", "scale_factor": 0.1},
        ],
    },
]


def default_registers(profile) -> Optional[List]:
    """Fresh RegisterDefinition rows for a built-in profile, or None when
    the profile has no factory definition (local profile, removed driver)."""
    from app.models.device_profile import RegisterDefinition

    if profile.manufacturer:
        import app.drivers.manufacturers  # noqa: F401 - triggers registration
        from app.drivers.registry import get_driver
        driver_cls = get_driver(profile.manufacturer)
        if not driver_cls:
            return None
        return [
            RegisterDefinition(
                position=i, address=r.address, name=r.name, unit=r.unit,
                description=r.description, data_type=r.data_type,
                scale_factor=r.scale_factor, writable=r.writable,
                is_alarm_register=r.is_alarm_register,
                register_type=r.register_type, category=r.category, bit=r.bit,
            )
            for i, r in enumerate(driver_cls().default_register_map())
        ]
    spec = next((g for g in GENERIC_PROFILES if g["name"] == profile.name), None)
    if spec is None:
        return None
    return [RegisterDefinition(position=i, **r) for i, r in enumerate(spec["registers"])]
