# Secret Rotation Runbook

## Overview

Cordum uses three secrets that must be rotated periodically or after any suspected compromise.

## Secrets

| Secret | Env Var | Min Length | Generate |
|--------|---------|-----------|----------|
| Redis password | `REDIS_PASSWORD` | 12 chars | `openssl rand -hex 16` |
| API key | `CORDUM_API_KEY` | 32 chars | `openssl rand -hex 32` |
| Admin password | `CORDUM_ADMIN_PASSWORD` | 16 chars | `openssl rand -base64 24` |

## Rotation Procedures

### Redis Password

1. Generate new password: `openssl rand -hex 16`
2. Update Redis ACL: `redis-cli ACL SETUSER default on >'<new-password>'`
3. Update `.env` with new `REDIS_PASSWORD`
4. Restart all Cordum services (gateway, scheduler, workflow engine, context engine)
5. Verify connectivity: `redis-cli -a '<new-password>' PING`

**Zero-downtime:** Update Redis ACL first, then roll services one at a time.

### API Key

1. Generate new key: `openssl rand -hex 32`
2. Update `.env` with new `CORDUM_API_KEY`
3. Restart the gateway
4. Update all API clients (dashboard, CLI, external integrations) with the new key
5. Verify: `curl -H 'X-API-Key: <new-key>' http://localhost:8081/api/v1/health`

**Zero-downtime:** Use `CORDUM_API_KEYS` (JSON array) to support both old and new keys during transition. Remove old key after all clients are updated.

### Admin Password

1. Generate new password: `openssl rand -base64 24`
2. Update `.env` with new `CORDUM_ADMIN_PASSWORD`
3. Restart the gateway (new password takes effect on next login)
4. Log in with new credentials to verify

## After a Suspected Compromise

1. Rotate ALL three secrets immediately
2. Check audit logs for unauthorized access
3. Revoke all active sessions
4. Review recent API key usage patterns
5. Notify team via secure channel

## Validation

The gateway validates secret strength at startup when `CORDUM_ENV=production`. Weak secrets are rejected with actionable error messages. Set `CORDUM_SKIP_SECRET_VALIDATION=true` only for development.
