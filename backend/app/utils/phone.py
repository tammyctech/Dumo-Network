import re


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

    cleaned = re.sub(r"[\s()-]", "", phone.strip())

    if cleaned.startswith("+234"):
        normalized = cleaned

    elif cleaned.startswith("234"):
        normalized = "+" + cleaned

    elif cleaned.startswith("0"):
        normalized = "+234" + cleaned[1:]

    else:
        raise ValueError(
            "Phone number must start with 0, 234, or +234."
        )

    if not re.fullmatch(r"\+234[789]\d{9}", normalized):
        raise ValueError(
            "Enter a valid Nigerian mobile phone number."
        )

    return normalized