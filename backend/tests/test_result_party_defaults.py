import unittest

from app.monitoring.result_schemas import PartyVoteInput, ResultSubmissionInput
from app.political_parties import REGISTERED_POLITICAL_PARTIES


class ResultPartyDefaultTests(unittest.TestCase):
    def test_unselected_registered_parties_default_to_zero(self):
        payload = ResultSubmissionInput(
            election_id=1,
            polling_unit_id=1,
            accredited_voters=12,
            valid_votes=12,
            rejected_votes=0,
            party_results=[PartyVoteInput(party="APC", votes=12)],
        )

        votes = {result.party: result.votes for result in payload.party_results}
        self.assertEqual(len(votes), len(REGISTERED_POLITICAL_PARTIES))
        self.assertEqual(votes["APC"], 12)
        self.assertEqual(votes["PDP"], 0)
        self.assertEqual(votes["NDC"], 0)


if __name__ == "__main__":
    unittest.main()
