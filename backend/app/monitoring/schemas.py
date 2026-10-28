from pydantic import BaseModel, Field


class RecentUpload(BaseModel):
    id: int
    polling_unit_id: int
    polling_unit_name: str
    lga: str
    submitted_by: str
    status: str
    submitted_at: str


class LGAProgress(BaseModel):
    lga: str
    total_polling_units: int
    submitted_polling_units: int


class PartyVoteTotal(BaseModel):
    party: str
    votes: int


class MonitoringResponse(BaseModel):
    state: str = "Rivers"

    total_polling_units: int

    submitted_polling_units: int | None = None
    awaiting_submission: int | None = None
    submission_coverage: float | None = None

    updated_results: int | None = None
    flagged_submissions: int | None = None

    recent_uploads: list[RecentUpload] = Field(default_factory=list)
    results_by_lga: list[LGAProgress] = Field(default_factory=list)
    party_vote_totals: list[PartyVoteTotal] = Field(default_factory=list)

    data_type: str = "unofficial_agent_submitted"