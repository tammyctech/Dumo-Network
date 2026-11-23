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

# Redis-backed rate limiting

Set `REDIS_URL` to the internal connection URL of the Render Key Value
instance. Sensitive endpoints use an atomic Redis token bucket. When the
variable is absent (local development/tests) or Redis is temporarily
unavailable, the API uses a process-local bucket so requests remain protected
without making the service unavailable.

# Secure sessions and MFA

Set `COOKIE_SECURE=true` in production. Generate a dedicated Fernet key for
`MFA_ENCRYPTION_KEY` with:

```text
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

After deployment, the administrator must open **Administrator MFA**, enroll an
authenticator, verify one code, and store the one-time recovery codes offline.

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

### Personal Gmail HTTPS API

To send over HTTPS instead of SMTP, enable the Gmail API in a Google Cloud
project, create an OAuth desktop/web client, authorize the personal Gmail
account once with the `https://www.googleapis.com/auth/gmail.send` scope, and
store the resulting refresh token as backend environment variables:

```env
EMAIL_PROVIDER=gmail_api
GMAIL_CLIENT_ID=your-google-oauth-client-id
GMAIL_CLIENT_SECRET=your-google-oauth-client-secret
GMAIL_REFRESH_TOKEN=your-revocable-refresh-token
GMAIL_SENDER_EMAIL=your-account@gmail.com
SMTP_FROM_NAME=Dumo Youth Network
```

Do not commit OAuth credentials or refresh tokens. Personal Gmail accounts are
limited to roughly 500 outgoing messages per day; use the delivery history to
avoid resending messages that were already delivered.

Use `SMTP_USE_SSL=true`, `SMTP_USE_TLS=false`, and usually port `465` when the
provider requires implicit SSL. Approval still succeeds if email delivery is
unavailable; the admin page reports that the message was not sent.

# Termii SMS

Configure these variables on the backend deployment to send approval and
polling-unit reassignment alerts by SMS:

```text
TERMII_BASE_URL=https://your-account-base-url
TERMII_API_KEY=your-live-api-key
TERMII_SENDER_ID=DYN
TERMII_PROMOTIONAL_SENDER_ID=DYN
TERMII_WEBHOOK_SECRET=your-termii-webhook-secret
```

Copy the account-specific base URL and API key from the Termii dashboard. The
sender ID must be approved in Termii and contain 3–11 characters. Welcome and
general agent messages use Termii's `generic` promotional route. Configure the
Termii delivery-report webhook as
`https://YOUR_API_HOST/api/webhooks/termii/delivery-report`; accepted messages
remain `SENT` until its signed report changes them to `DELIVERED`, `FAILED`, or
`REJECTED`. `TERMII_WEBHOOK_SECRET` should be the secret Termii uses to sign
`X-Termii-Signature`; it falls back to `TERMII_API_KEY` for existing setups.

Do not route OTP or security messages through `generic`. If transactional SMS
is approved later, configure `TERMII_TRANSACTIONAL_SENDER_ID` and
`TERMII_TRANSACTIONAL_CHANNEL=dnd` separately. Do not commit real credentials.
