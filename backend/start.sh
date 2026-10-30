#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

# Apply additive schema changes before accepting traffic. Alembic uses a
# transactional migration on PostgreSQL, so a failed migration prevents a
# partially compatible application from starting.
alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
