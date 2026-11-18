import asyncio
import hashlib
import logging
import math
import os
import time
from dataclasses import dataclass

from redis.asyncio import Redis
from starlette.datastructures import Headers
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BucketRule:
    name: str
    capacity: int
    refill_seconds: int

    @property
    def refill_rate(self) -> float:
        return self.capacity / self.refill_seconds


RULES: tuple[tuple[str, str, BucketRule], ...] = (
    ("POST", "/api/auth/login", BucketRule("login", 5, 60)),
    ("POST", "/api/auth/forgot-password", BucketRule("forgot-password", 3, 300)),
    ("POST", "/api/auth/reset-password", BucketRule("reset-password", 5, 300)),
    ("POST", "/api/phone/validate", BucketRule("phone-validation", 20, 60)),
    ("POST", "/api/agent-applications/", BucketRule("agent-application", 5, 600)),
    ("POST", "/api/admin/agents", BucketRule("admin-agent-create", 30, 60)),
    ("PATCH", "/api/admin/users/", BucketRule("admin-agent-update", 60, 60)),
    ("POST", "/api/admin/agent-imports/preview", BucketRule("import-preview", 20, 60)),
    ("POST", "/api/admin/agent-imports/confirm", BucketRule("import-confirm", 5, 60)),
)


LUA_TOKEN_BUCKET = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local values = redis.call('HMGET', key, 'tokens', 'updated')
local tokens = tonumber(values[1]) or capacity
local updated = tonumber(values[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - updated) * rate)
local allowed = 0
local retry = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
else
  retry = math.ceil((requested - tokens) / rate)
end
redis.call('HSET', key, 'tokens', tokens, 'updated', now)
redis.call('EXPIRE', key, math.ceil((capacity / rate) * 2))
return {allowed, math.floor(tokens), retry}
"""


class TokenBucketStore:
    def __init__(self) -> None:
        url = os.getenv("REDIS_URL", "").strip()
        self.redis = Redis.from_url(url, decode_responses=True) if url else None
        self.local: dict[str, tuple[float, float]] = {}
        self.lock = asyncio.Lock()

    async def consume(self, key: str, rule: BucketRule) -> tuple[bool, int, int]:
        now = time.time()
        if self.redis is not None:
            try:
                result = await self.redis.eval(
                    LUA_TOKEN_BUCKET, 1, key, rule.capacity, rule.refill_rate, now, 1
                )
                return bool(int(result[0])), int(result[1]), int(result[2])
            except Exception:
                logger.exception("Redis token bucket unavailable; using process-local fallback")
        async with self.lock:
            tokens, updated = self.local.get(key, (float(rule.capacity), now))
            tokens = min(float(rule.capacity), tokens + max(0, now - updated) * rule.refill_rate)
            if tokens >= 1:
                tokens -= 1
                self.local[key] = (tokens, now)
                return True, math.floor(tokens), 0
            retry = max(1, math.ceil((1 - tokens) / rule.refill_rate))
            self.local[key] = (tokens, now)
            return False, 0, retry


def rule_for(method: str, path: str) -> BucketRule | None:
    for expected_method, prefix, rule in RULES:
        if method == expected_method and (path == prefix or path.startswith(prefix)):
            return rule
    return None


def request_identity(headers: Headers, client_host: str | None) -> str:
    # Always include the network origin. Using an unverified Authorization
    # header here would let an attacker bypass limits by sending random tokens.
    forwarded = headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    return "ip:" + (forwarded or client_host or "unknown")


class TokenBucketMiddleware:
    def __init__(self, app, store: TokenBucketStore | None = None):
        self.app = app
        self.store = store or TokenBucketStore()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        rule = rule_for(scope["method"], scope["path"])
        if rule is None:
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        client = scope.get("client")
        identity = request_identity(headers, client[0] if client else None)
        digest = hashlib.sha256(f"{rule.name}:{identity}".encode()).hexdigest()
        allowed, remaining, retry = await self.store.consume(f"dumo:rate:{digest}", rule)
        if not allowed:
            response = JSONResponse(
                {"detail": "Too many requests. Please wait and try again."},
                status_code=429,
                headers={"Retry-After": str(retry), "X-RateLimit-Remaining": "0"},
            )
            await response(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                mutable = list(message.get("headers", []))
                mutable.append((b"x-ratelimit-limit", str(rule.capacity).encode()))
                mutable.append((b"x-ratelimit-remaining", str(remaining).encode()))
                message["headers"] = mutable
            await send(message)

        await self.app(scope, receive, send_with_headers)
