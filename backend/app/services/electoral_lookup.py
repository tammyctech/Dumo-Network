"""Canonical Rivers State electoral identifiers and polling-unit lookup."""

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PollingUnit, Ward
from app.wards.routes import RIVERS_LGAS


def _text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def _alias_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).strip()


LGA_ALIASES = {_alias_key(name): name for name in RIVERS_LGAS} | {
    "oyibo": "Oyigbo",
    "phalga": "Port Harcourt",
    "port harcourt city": "Port Harcourt",
    "port harcourt city lga": "Port Harcourt",
    "obio akpor": "Obio/Akpor",
    "abua odual": "Abua/Odual",
    "akuku toru": "Akuku-Toru",
    "asari toru": "Asari-Toru",
    "ogba egbema ndoni": "Ogba/Egbema/Ndoni",
    "ogu bolo": "Ogu/Bolo",
    "opobo nkoro": "Opobo/Nkoro",
}


def normalize_lga(value: object) -> str:
    canonical = LGA_ALIASES.get(_alias_key(value))
    if not canonical:
        raise ValueError(f"Unrecognized Rivers State LGA: {str(value or '').strip() or 'blank'}.")
    return canonical


def normalize_ward_number(value: object) -> int:
    match = re.fullmatch(r"(?:ward|w)?\s*0*([1-9][0-9]*)", _text(value))
    if not match:
        raise ValueError("Ward must be an official name or a number such as Ward 9.")
    return int(match.group(1))


def normalize_polling_unit_number(value: object) -> int:
    match = re.fullmatch(r"(?:(?:polling\s*unit)|pu)?\s*0*([1-9][0-9]*)", _text(value))
    if not match:
        raise ValueError("Polling-unit number must be a positive number such as 001 or PU 001.")
    return int(match.group(1))


def display_polling_unit_number(value: object) -> str:
    return f"{normalize_polling_unit_number(value):03d}"


def polling_unit_number_from_code(code: str) -> int | None:
    parts = re.findall(r"\d+", code or "")
    return int(parts[-1]) if parts else None


@dataclass(frozen=True)
class PollingUnitMatch:
    unit: PollingUnit
    lga: str
    ward: Ward | None
    polling_unit_number: int


class PollingUnitDirectory:
    """In-memory authoritative view of the database for consistent imports."""

    def __init__(self, db: Session):
        self.units = db.scalars(select(PollingUnit).where(PollingUnit.state.ilike("Rivers"))).all()
        self.wards = db.scalars(select(Ward).where(Ward.state.ilike("Rivers"))).all()
        self.units_by_code = {_text(unit.code): unit for unit in self.units}
        self.wards_by_number = {(normalize_lga(ward.lga), ward.ward_number): ward for ward in self.wards}
        self.wards_by_name = {(normalize_lga(ward.lga), _text(ward.name)): ward for ward in self.wards}

    def resolve_ward(self, lga: str, value: object) -> Ward | None:
        try:
            number = normalize_ward_number(value)
        except ValueError:
            return self.wards_by_name.get((lga, _text(value)))
        return self.wards_by_number.get((lga, number))

    def lookup(
        self, *, lga: object, ward: object, polling_unit_number: object,
        polling_unit_code: object = "", polling_unit_name: object = "",
    ) -> PollingUnitMatch:
        canonical_lga = normalize_lga(lga)
        number = normalize_polling_unit_number(polling_unit_number)
        resolved_ward = self.resolve_ward(canonical_lga, ward)
        if resolved_ward is None:
            raise ValueError(f"Ward {str(ward).strip()} was not found in {canonical_lga} LGA.")

        code = str(polling_unit_code or "").strip()
        if code:
            unit = self.units_by_code.get(_text(code))
            if unit is None:
                raise ValueError(f"Polling-unit code {code} was not found.")
            try:
                unit_lga = normalize_lga(unit.lga)
            except ValueError:
                raise ValueError(f"Polling-unit code {code} has an invalid LGA association.") from None
            if unit_lga != canonical_lga or _text(unit.ward) != _text(resolved_ward.name):
                raise ValueError(f"Polling-unit code {code} does not belong to the selected LGA and ward.")
            if polling_unit_number_from_code(unit.code) != number:
                raise ValueError(f"Polling-unit code {code} conflicts with polling-unit number {number:03d}.")
            matches = [unit]
        else:
            matches = [
                unit for unit in self.units
                if normalize_lga(unit.lga) == canonical_lga
                and _text(unit.ward) == _text(resolved_ward.name)
                and polling_unit_number_from_code(unit.code) == number
            ]
        if not matches:
            raise ValueError(f"Polling Unit {number:03d} was not found in {resolved_ward.name}, {canonical_lga} LGA.")
        if len(matches) > 1:
            raise ValueError("Polling-unit lookup is ambiguous; provide the authoritative Polling Unit Code.")
        unit = matches[0]
        if polling_unit_name and _text(polling_unit_name) != _text(unit.name):
            raise ValueError("Polling-unit name does not match the authoritative database record.")
        return PollingUnitMatch(unit=unit, lga=canonical_lga, ward=resolved_ward, polling_unit_number=number)
