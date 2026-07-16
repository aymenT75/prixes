// Smoke test — 1 VU, a few iterations. Run this before the full load test to
// catch a broken endpoint/config fast, without generating real load.
//
// Usage: k6 run loadtest/smoke.js
// Usage (against prod): BASE_URL=https://prixes.omnilink.software k6 run loadtest/smoke.js
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

export const options = {
  vus: 1,
  iterations: 3,
  thresholds: {
    http_req_failed: ["rate==0"],
    http_req_duration: ["p(95)<1000"],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, { "health is 200": (r) => r.status === 200 });

  const meta = http.get(`${BASE_URL}/api/v1/meta`);
  check(meta, { "meta is 200": (r) => r.status === 200 });

  const products = http.get(`${BASE_URL}/api/v1/products?limit=10`);
  check(products, {
    "products is 200": (r) => r.status === 200,
    "products has items": (r) => JSON.parse(r.body).items !== undefined,
  });

  sleep(1);
}
