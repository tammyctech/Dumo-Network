import unittest

from app.utils.names import normalize_person_name


class PersonNameNormalizationTests(unittest.TestCase):
    def test_capitalizes_each_name_without_destroying_existing_case(self):
        self.assertEqual(normalize_person_name("israel chinaza"), "Israel Chinaza")
        self.assertEqual(normalize_person_name("  obayi   amarachi lynda "), "Obayi Amarachi Lynda")
        self.assertEqual(normalize_person_name("mary-jane o'brien"), "Mary-Jane O'Brien")
        self.assertEqual(normalize_person_name("Prince C. David"), "Prince C. David")


if __name__ == "__main__":
    unittest.main()
