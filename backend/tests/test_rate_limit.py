import os
import unittest

os.environ.setdefault("DATABASE_URL", "sqlite://")

from app.services.rate_limit import BucketRule, TokenBucketStore, rule_for


class TokenBucketTests(unittest.IsolatedAsyncioTestCase):
    async def test_bucket_allows_capacity_then_returns_retry(self):
        store = TokenBucketStore()
        store.redis = None
        rule = BucketRule("test", capacity=2, refill_seconds=60)
        self.assertEqual(await store.consume("client", rule), (True, 1, 0))
        self.assertEqual(await store.consume("client", rule), (True, 0, 0))
        allowed, remaining, retry = await store.consume("client", rule)
        self.assertFalse(allowed)
        self.assertEqual(remaining, 0)
        self.assertGreaterEqual(retry, 1)

    async def test_clients_have_independent_buckets(self):
        store = TokenBucketStore()
        store.redis = None
        rule = BucketRule("test", capacity=1, refill_seconds=60)
        self.assertTrue((await store.consume("first", rule))[0])
        self.assertTrue((await store.consume("second", rule))[0])

    def test_sensitive_routes_are_matched(self):
        self.assertEqual(rule_for("POST", "/api/auth/login").name, "login")
        self.assertEqual(rule_for("POST", "/api/agent-applications/token").name, "agent-application")
        self.assertIsNone(rule_for("GET", "/api/admin/users"))


if __name__ == "__main__":
    unittest.main()
