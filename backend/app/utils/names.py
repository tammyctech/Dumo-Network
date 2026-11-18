import re


def normalize_person_name(value: str) -> str:
    """Normalize spacing and capitalize each name component without lowercasing it."""
    cleaned = " ".join(str(value or "").strip().split())
    return re.sub(r"(^|[\s'-])([a-z])", lambda match: match.group(1) + match.group(2).upper(), cleaned)
