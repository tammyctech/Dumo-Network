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

# Approval email

Configure these environment variables on the backend deployment to email an
agent immediately after an administrator approves their application:

```text
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=no-reply@your-domain.com
SMTP_FROM_NAME=Dumo Youth Network
SMTP_USE_TLS=true
SMTP_USE_SSL=false
FRONTEND_URL=https://dumo-network.vercel.app
```

Use `SMTP_USE_SSL=true`, `SMTP_USE_TLS=false`, and usually port `465` when the
provider requires implicit SSL. Approval still succeeds if email delivery is
unavailable; the admin page reports that the message was not sent.

# Termii SMS

Configure these variables on the backend deployment to send approval and
polling-unit reassignment alerts by SMS:

```text
TERMII_BASE_URL=https://your-account-base-url
TERMII_API_KEY=your-live-api-key
TERMII_SENDER_ID=Dumo
TERMII_CHANNEL=dnd
```

Copy the account-specific base URL and API key from the Termii dashboard. The
sender ID must be approved in Termii and contain 3–11 characters. The `dnd`
route is recommended for transactional alerts and must be activated on the
Termii account. Do not commit the real API key.
