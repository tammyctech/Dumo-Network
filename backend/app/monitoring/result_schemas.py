from pydantic import BaseModel, Field, model_validator


class PartyVoteInput(BaseModel):
    party: str = Field(min_length=1, max_length=100)
    votes: int = Field(ge=0)


class ResultSubmissionInput(BaseModel):
    election_id: int = Field(gt=0)
    polling_unit_id: int = Field(gt=0)

    accredited_voters: int = Field(ge=0)
    valid_votes: int = Field(ge=0)
    rejected_votes: int = Field(ge=0)

    party_results: list[PartyVoteInput] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_vote_totals(self):
        party_names = [
            result.party.strip().upper()
            for result in self.party_results
        ]

        if len(party_names) != len(set(party_names)):
            raise ValueError(
                "Each political party must appear only once."
            )

        total_party_votes = sum(
            result.votes
            for result in self.party_results
        )

        if total_party_votes != self.valid_votes:
            raise ValueError(
                "Total party votes must equal valid votes."
            )

        if self.valid_votes + self.rejected_votes > self.accredited_voters:
            raise ValueError(
                "Total votes cannot exceed accredited voters."
            )

        return self


class ResultSubmissionResponse(BaseModel):
    message: str
    submission_id: int
    election_id: int
    polling_unit_id: int
    submitted_by: int
    data_type: str = "unofficial_agent_submitted"