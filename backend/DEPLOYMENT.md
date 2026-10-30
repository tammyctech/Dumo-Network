# Backend deployment

The API depends on Alembic-managed schema changes. Deploying new application
code without upgrading the database can cause authenticated requests to fail.

For Render, set the service root directory to `backend` and use:

```text
Build command: pip install -r requirements.txt
Start command: ./start.sh
```

Required environment variables remain configured in Render; do not commit
their values. The start script runs `alembic upgrade head` before Uvicorn.
