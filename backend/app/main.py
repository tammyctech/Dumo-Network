from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import func
from sqlalchemy.orm import Session

# =====================================================
# DATABASE
# =====================================================

from .database import SessionLocal
from .models import PollingUnit

# =====================================================
# EXISTING API ROUTES
# =====================================================

from .routes import polling_units, auth, monitoring
from .routes import results
from .routes import election_admin
from .routes import result_uploads

from .routes import agent_assignments
from .routes import admin_options
from .routes import user_management
from .routes import assignment_management
from .routes import dashboard_statistics
from .routes import result_details

# =====================================================
# AGENT MANAGEMENT AND ACTIVATION
# =====================================================

from .routers import admin_agents
from .routers import agent_activation

# =====================================================
# WARD MANAGEMENT ROUTER
# =====================================================

from .wards import routes as ward_routes

# =====================================================
# BULK IMPORT ROUTER
# =====================================================

from .imports import routes as import_routes


# =====================================================
# 1. CREATE FASTAPI APPLICATION
# =====================================================

app = FastAPI(
    title="Dumo Network API",
    description="AI-Powered Election Monitoring Platform",
    version="1.0.0",
)


# =====================================================
# 2. CONFIGURE CORS
# =====================================================

# Allow the React development frontend to communicate
# with the FastAPI backend.

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):517[0-9]$",
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PATCH",
        "PUT",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=["*"],
)


# =====================================================
# 3. DATABASE TABLE MANAGEMENT
# =====================================================

# Database tables are managed through Alembic migrations.
# Do not automatically create tables here.


# =====================================================
# 4. DATABASE SESSION DEPENDENCY
# =====================================================

def get_db():
    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()


# =====================================================
# 5. REGISTER API ROUTES
# =====================================================

# Polling Unit Management
app.include_router(polling_units.router)

# Authentication
app.include_router(auth.router)

# Election Monitoring
app.include_router(monitoring.router)

# Election Results
app.include_router(results.router)

# Election Administration
app.include_router(election_admin.router)

# Result Uploads
app.include_router(result_uploads.router)

# Agent Assignments
app.include_router(agent_assignments.router)

# Administrator Options
app.include_router(admin_options.router)

# User Management
app.include_router(user_management.router)

# Assignment Management
app.include_router(assignment_management.router)

# Dashboard Statistics
app.include_router(dashboard_statistics.router)

# Result Details
app.include_router(result_details.router)


# =====================================================
# 6. AGENT MANAGEMENT
# =====================================================

# Administrators create and manage agent invitations.
app.include_router(admin_agents.router)

# Agents activate their accounts using invitation tokens.
app.include_router(agent_activation.router)


# =====================================================
# 7. WARD MANAGEMENT
# =====================================================

app.include_router(ward_routes.router)


# =====================================================
# 8. BULK IMPORT MANAGEMENT
# =====================================================

# Import ward registers and polling-unit records.
# Access restrictions are enforced by the import router.

app.include_router(import_routes.router)


# =====================================================
# 9. HOME ENDPOINT
# =====================================================

@app.get("/")
def home():
    return {
        "application": "Dumo Network",
        "message": "Welcome to Dumo Network",
        "status": "running",
    }


# =====================================================
# 10. DASHBOARD ENDPOINT
# =====================================================

@app.get("/api/dashboard")
def get_dashboard(
    db: Session = Depends(get_db),
):
    # Count polling units stored in PostgreSQL.
    total_polling_units = db.query(
        func.count(PollingUnit.id)
    ).scalar()

    return {
        "total_polling_units": total_polling_units or 0,

        # These statistics are not yet available.
        "reported_polling_units": None,
        "verified_results": None,
        "pending_verification": None,

        "data_type": "partial_live",
        "message": "Polling unit count retrieved from PostgreSQL",
    }