# Security operations runbook

## Required production configuration

- Set a strong, unique `JWT_SECRET_KEY` and `MFA_ENCRYPTION_KEY` in Render.
- Set `COOKIE_SECURE=true`, `FRONTEND_URL=https://dumo-network.vercel.app`, and the internal `REDIS_URL`.
- Enable administrator MFA at **Administration → Administrator MFA** and store recovery codes offline.
- Configure Render log alerts for `SECURITY`, repeated `401`, `429`, database errors, and failed deployments.

Generate secrets locally with `openssl rand -base64 48`. Rotate one secret at a time during a maintenance window. Rotating `JWT_SECRET_KEY` signs every user out. Do not rotate `MFA_ENCRYPTION_KEY` until MFA secrets have been re-encrypted or every administrator has disabled and re-enrolled MFA.

## Database backups

Enable Render PostgreSQL point-in-time recovery or daily logical backups. Keep an encrypted copy outside Render under a separate administrator account. Monthly, restore the newest backup into an isolated database and run `SELECT count(*)` checks for users, assignments, polling units, audit logs, and results. Record the restore duration and outcome. Never test restoration over production.

## Incident response

On suspected compromise: disable the affected account, increment its `session_version`, rotate relevant credentials, preserve Render/Vercel/PostgreSQL logs, review `audit_logs`, and notify affected administrators. Do not delete evidence.

## Independent penetration test

Before election operations, engage a tester who is independent of the development team. Scope authentication, MFA/recovery, horizontal and vertical authorization, admin actions, file uploads, bulk imports, API rate limits, session/CSRF behavior, Vercel rewrites, Render configuration, PostgreSQL exposure, and recovery procedures. Use a staging clone with synthetic data. Require a written report, severity ratings, retesting, and proof that critical/high findings are closed.
