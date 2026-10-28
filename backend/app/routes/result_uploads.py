from pathlib import Path
from uuid import uuid4
import os

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    User,
    ResultSubmission,
    ResultEvidence,
    AgentAssignment,
    Election,
    PollingUnit,
)
from ..security import get_current_user


router = APIRouter(
    prefix="/api/results",
    tags=["Result Sheet Uploads"],
)

UPLOAD_DIR = Path("uploads/result_sheets").resolve()

MAX_FILE_SIZE = 5 * 1024 * 1024

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
}


@router.post(
    "/{submission_id}/upload",
    status_code=status.HTTP_201_CREATED,
)
async def upload_result_sheet(
    submission_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    # 1. Require an active account.
    if not current_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Your account is inactive.",
        )

    # 2. Find the submitted result.
    submission = db.get(
        ResultSubmission,
        submission_id,
    )

    if submission is None:
        raise HTTPException(
            status_code=404,
            detail="Result submission not found.",
        )

    # 3. Confirm the logged-in agent owns the submission.
    if submission.agent_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot upload evidence for this submission.",
        )

    # 4. Confirm the agent is still assigned.
    assignment = db.query(AgentAssignment).filter(
        AgentAssignment.agent_id == current_user.id,
        AgentAssignment.election_id == submission.election_id,
        AgentAssignment.polling_unit_id == submission.polling_unit_id,
    ).first()

    if assignment is None:
        raise HTTPException(
            status_code=403,
            detail="You are not assigned to this polling unit.",
        )

    # 5. Restrict uploads to Rivers State elections.
    election = db.get(
        Election,
        submission.election_id,
    )

    polling_unit = db.get(
        PollingUnit,
        submission.polling_unit_id,
    )

    if (
        election is None
        or polling_unit is None
        or (election.state or "").strip().lower() != "rivers"
        or (polling_unit.state or "").strip().lower() != "rivers"
    ):
        raise HTTPException(
            status_code=403,
            detail="Only Rivers State results are supported.",
        )

    # 6. Check the declared image type.
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG and PNG images are allowed.",
        )

    # 7. Read at most the maximum size plus one byte.
    content = await file.read(MAX_FILE_SIZE + 1)

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Image must not exceed 5 MB.",
        )

    # 8. Check the actual file signature.
    if file.content_type == "image/jpeg":
        valid_signature = content.startswith(b"\xff\xd8\xff")
    else:
        valid_signature = content.startswith(b"\x89PNG\r\n\x1a\n")

    if not valid_signature:
        raise HTTPException(
            status_code=400,
            detail="File contents do not match the selected image type.",
        )

    # 9. Decode the image to reject malformed image data.
    try:
        from io import BytesIO
        from PIL import Image

        with Image.open(BytesIO(content)) as image:
            image.verify()

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image is invalid or corrupted.",
        )

    # 10. Generate a random filename.
    extension = ALLOWED_IMAGE_TYPES[file.content_type]

    filename = f"{uuid4().hex}{extension}"

    UPLOAD_DIR.mkdir(
        parents=True,
        exist_ok=True,
        mode=0o700,
    )

    destination = UPLOAD_DIR / filename

    # 11. Save the image privately.
    try:
        with open(destination, "xb") as output:
            output.write(content)

        os.chmod(destination, 0o600)

        # 12. Record the uploaded evidence.
        evidence = ResultEvidence(
            submission_id=submission.id,
            file_path=str(destination),
        )

        db.add(evidence)
        db.commit()
        db.refresh(evidence)

    except Exception:
        db.rollback()

        destination.unlink(missing_ok=True)

        raise HTTPException(
            status_code=500,
            detail="Could not save the result-sheet image.",
        )

    finally:
        await file.close()

    return {
        "message": "Result-sheet image uploaded successfully.",
        "evidence_id": evidence.id,
        "submission_id": submission.id,
        "data_type": "unofficial_agent_submitted",
    }