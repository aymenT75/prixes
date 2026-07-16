// Load test for the read-heavy endpoints real users hit hardest: catalog browse,
// product search, the deals feed, and nearby-stores geolocation lookup. These are
// exactly the paths flagged in the SIT audit as needing a load-test baseline
// (no k6/locust existed before this).
//
// Usage:
//   k6 run loadtest/api-load.js
//   BASE_URL=https://prixes.omnilink.software k6 run loadtest/api-load.js
//
// Ramps to 50 concurrent users over 3 stages. Tune `options.stages` for a
// heavier run once you have a baseline to compare against.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

export const options = {
  stages: [
    { duration: "30s", target: 10 }, // warm up
    { duration: "1m", target: 50 },  // ramp to steady load
    { duration: "30s", target: 0 },  // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"], // <1% errors
    http_req_duration: ["p(95)<500", "p(99)<1500"],
  },
};

// A few realistic French grocery search terms (avoids every VU hammering the
// exact same cached query).
const SEARCH_TERMS = ["yaourt", "chocolat", "pates", "cereales", "biscuit"];

// Central Paris — any real coordinate works; nearby-stores is cached on a
// ~110m grid server-side so this also exercises that cache.
const LAT = 48.8566;
const LON = 2.3522;

export default function () {
  const browse = http.get(`${BASE_URL}/api/v1/products?limit=20`);
  check(browse, { "browse 200": (r) => r.status === 200 });

  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const search = http.get(`${BASE_URL}/api/v1/products/search?q=${term}`);
  check(search, { "search 200": (r) => r.status === 200 });

  const deals = http.get(`${BASE_URL}/api/v1/deals?sort=hot&limit=20`);
  check(deals, { "deals feed 200": (r) => r.status === 200 });

  const stores = http.get(
    `${BASE_URL}/api/v1/stores/nearby?lat=${LAT}&lon=${LON}&radius_km=5`,
  );
  check(stores, { "stores nearby 200": (r) => r.status === 200 });

  sleep(Math.random() * 2 + 1); // 1-3s think time between actions, like a real user
}
