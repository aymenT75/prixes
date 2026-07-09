"""Application configuration via Pydantic settings (12-factor, env-driven)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # App
    environment: Literal["local", "staging", "production"] = "local"
    secret_key: str = "change-me"
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

    # AI product recognition (deal photo → product name). Optional: barcode
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

    # Object storage
    s3_endpoint_url: str = ""
    s3_bucket: str = "prixes-photos"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_public_base_url: str = ""

    # Upstream open-data
    off_base_url: str = "https://world.openfoodfacts.org"
    openprices_base_url: str = "https://prices.openfoodfacts.org/api"
    fuel_data_url: str = "https://donnees.roulez-eco.fr/opendata/instantane"

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
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
