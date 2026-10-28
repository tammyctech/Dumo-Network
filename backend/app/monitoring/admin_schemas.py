from datetime import datetime

from pydantic import BaseModel, Field


class ElectionCreate(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    election_date: datetime


class ElectionResponse(BaseModel):
    id: int
    name: str
    election_date: datetime
    state: str


class AgentAssignmentCreate(BaseModel):
    election_id: int = Field(gt=0)
    polling_unit_id: int = Field(gt=0)
    agent_id: int = Field(gt=0)


class AgentAssignmentResponse(BaseModel):
    id: int
    election_id: int
    polling_unit_id: int
    agent_id: int
    message: str