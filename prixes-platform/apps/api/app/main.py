"""FastAPI application entrypoint."""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.core.config import settings
from app.core.http import close_http_client
from app.core.redis import redis_client
from app.domains.alerts.router import router as alerts_router
from app.domains.auth.router import router as auth_router
from app.domains.deals.router import router as deals_router
from app.domains.fuel.router import router as fuel_router
from app.domains.moderation.router import router as moderation_router
from app.domains.products.router import router as products_router
from app.domains.shopping.router import router as shopping_router
from app.domains.uploads.router import router as uploads_router
from app.domains.users.router import router as users_router

if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.environment, traces_sample_rate=0.1)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await redis_client.ping()
    yield
    await close_http_client()
    await redis_client.aclose()


app = FastAPI(
    title="Prixes API",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}


API_V1 = "/api/v1"


@app.get(f"{API_V1}/meta", tags=["meta"])
async def meta() -> dict[str, object]:
    """Public capability flags the frontend uses to adapt its UI."""
    uploads_enabled = bool(
        settings.s3_access_key_id and settings.s3_secret_access_key and settings.s3_public_base_url
    )
    return {"uploads_enabled": uploads_enabled, "environment": settings.environment}


app.include_router(auth_router, prefix=API_V1)
app.include_router(users_router, prefix=API_V1)
app.include_router(deals_router, prefix=API_V1)
app.include_router(products_router, prefix=API_V1)
app.include_router(fuel_router, prefix=API_V1)
app.include_router(uploads_router, prefix=API_V1)
app.include_router(moderation_router, prefix=API_V1)
app.include_router(shopping_router, prefix=API_V1)
app.include_router(alerts_router, prefix=API_V1)
