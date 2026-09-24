"""Application configuration via Pydantic settings (12-factor, env-driven)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # App
    environment: Literal["local", "staging", "production"] = "local"
    secret_key: str = "change-me"  # noqa: S105 — placeholder default, real value from env (see DEPLOY.md)
    api_base_url: str = "http://localhost:8000"
    web_base_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"
    log_level: str = "INFO"

    # Database / cache
    database_url: PostgresDsn
    redis_url: RedisDsn

    # Auth
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 30
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    # Firebase Auth: we verify client ID tokens against Google's securetoken JWKS.
    # This is the Firebase *project id* (public); no service-account key needed.
    firebase_project_id: str = "prixes-b07fb"

    # Firebase Cloud Messaging (server → device push for price alerts). Provide a
    # service-account credential as a file path OR inline JSON. Empty = push disabled
    # (alerts still trigger in-app + email). APNs is delivered through FCM.
    firebase_service_account_file: str = ""
    firebase_service_account_json: str = ""

    # AI product recognition (product photo → name/brand). Optional: barcode
    # detection works without it; this is the vision fallback. Set a key to enable.
    # OpenAI (GPT-4o) is used when its key is set, else Anthropic (Claude).
    openai_api_key: str = ""
    openai_recognition_model: str = "gpt-4o-mini"
    anthropic_api_key: str = ""
    recognition_model: str = "claude-haiku-4-5-20251001"

    # Natural text-to-speech for the voice assistant (OpenAI). Reuses openai_api_key;
    # falls back to on-device/browser TTS when the key is absent.
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "nova"

    # One photo per menu dish, drawn by Cloudflare Workers AI (FLUX.1 schnell) once
    # per title and kept on disk. Empty account/token = no photos, the icon shows.
    # The cap keeps us inside the free 10,000 neurons/day: a 1024px image at 4
    # steps is ~58 neurons, so 150 photos ≈ 8,640 neurons — never billed.
    cloudflare_account_id: str = ""
    cloudflare_ai_token: str = ""
    meal_image_model: str = "@cf/black-forest-labs/flux-1-schnell"
    meal_image_dir: str = "/data/meal-images"
    meal_image_daily_cap: int = 150

    # Premium via Stripe (web). Empty key = no checkout offered; the paid features
    # stay locked for everyone but existing subscribers. Prices are Stripe Price
    # IDs (price_...) created in the Stripe dashboard.
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_monthly: str = ""
    stripe_price_yearly: str = ""
    # Where Stripe sends the user back after paying or managing the subscription.
    billing_return_url: str = "https://prixes.app/account"

    # Upstream open-data
    off_base_url: str = "https://world.openfoodfacts.org"
    openprices_base_url: str = "https://prices.openfoodfacts.org/api"
    # French national instantaneous fuel-price feed (zipped XML, ~9800 stations).
    fuel_data_url: str = "https://donnees.roulez-eco.fr/opendata/instantane"

    # MongoDB (Atlas M0) — the V3 document collections: smart-cart drafts, meal
    # plans and imported recipes. The relational core (products,
    # prices, users, fuel) stays in Postgres. Empty = those features answer 503
    # and the rest of the app is unaffected.
    mongo_url: str = ""
    mongo_db: str = "prixes"

    # Smart Assistant (text-to-cart) + weekly meal planner.
    # Reuses openai_api_key / anthropic_api_key; OpenAI wins when both are set,
    # same rule as product recognition.
    smartcart_model: str = "gpt-4o-mini"
    smartcart_anthropic_model: str = "claude-haiku-4-5-20251001"
    smartcart_timeout_s: float = 20.0
    smartcart_deadline_s: float = 25.0
    smartcart_cache_ttl_s: int = 86400
    # Ten was too mean for someone discovering the feature: a few tries, a couple
    # of refusals, and they were locked out for the rest of the hour. Repeated
    # prompts are answered from the Redis cache and a request that produces
    # nothing now hands its quota back, so the real model spend barely moves.
    smartcart_rate_per_hour: int = 25
    mealplan_rate_per_day: int = 5

    # Observability
    sentry_dsn: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        web = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        # Fixed origins used by the Capacitor native shells (iOS uses capacitor://,
        # Android uses https://localhost with androidScheme "https"). Always allowed so
        # the mobile apps work without extra env configuration.
        native = ["capacitor://localhost", "ionic://localhost", "https://localhost", "http://localhost"]
        return web + [o for o in native if o not in web]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
