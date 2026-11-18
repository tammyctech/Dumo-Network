import re

import phonenumbers
from phonenumbers import PhoneNumberFormat, PhoneNumberType


def normalize_nigerian_phone(phone: str) -> str:
    """
    Normalize Nigerian mobile phone numbers.

    Accepted:
        08012345678
        2348012345678
        +2348012345678

    Stored:
        +2348012345678
    """

    if not isinstance(phone, str) or not phone.strip():
        raise ValueError("Enter a valid Nigerian phone number.")
    raw = phone.strip()
    # Spaces are explicitly supported; punctuation and letters are not. This
    # avoids phonenumbers' intentionally permissive parsing accepting typos.
    if not re.fullmatch(r"\+?[0-9 ]+", raw):
        raise ValueError("Enter a valid Nigerian phone number.")
    compact = raw.replace(" ", "")
    if compact.startswith("234"):
        compact = "+" + compact
    elif compact.startswith("0"):
        compact = "+234" + compact[1:]
    elif not compact.startswith("+234"):
        raise ValueError("Enter a valid Nigerian phone number.")
    try:
        parsed = phonenumbers.parse(compact, "NG")
    except phonenumbers.NumberParseException as exc:
        raise ValueError("Enter a valid Nigerian phone number.") from exc
    mobile_types = {PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE}
    if (
        parsed.country_code != 234
        or not phonenumbers.is_valid_number(parsed)
        or phonenumbers.number_type(parsed) not in mobile_types
    ):
        raise ValueError("Enter a valid Nigerian phone number.")
    return phonenumbers.format_number(parsed, PhoneNumberFormat.E164)
