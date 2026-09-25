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
from app.core.llm import llm_enabled
from app.core.mongo import close_mongo, ensure_indexes, mongo_ready
from app.core.redis import redis_client
from app.domains.alerts.router import router as alerts_router
from app.domains.analytics.router import router as analytics_router
from app.domains.auth.router import router as auth_router
from app.domains.billing.router import router as billing_router
from app.domains.devices.router import router as devices_router
from app.domains.feedback.router import router as feedback_router
from app.domains.fuel.router import router as fuel_router
from app.domains.mealplan.router import router as mealplan_router
from app.domains.products.router import router as products_router
from app.domains.recipes.router import router as recipes_router
from app.domains.shopping.router import router as shopping_router
from app.domains.smartcart.router import router as smartcart_router
from app.domains.stores.router import router as stores_router
from app.domains.tts.router import router as tts_router
from app.domains.users.router import router as users_router

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn, environment=settings.environment, traces_sample_rate=0.1
    )


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await redis_client.ping()
    # Mongo holds the V3 document collections only; a failure here must not stop
    # the API from serving everything else (ensure_indexes swallows its own errors).
    await ensure_indexes()
    yield
    await close_http_client()
    await redis_client.aclose()
    await close_mongo()


app = FastAPI(
    title="Prixes API",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    # Interactive docs are a dev convenience: they publish the whole API surface.
    # In production they are currently unreachable only because Caddy proxies /api/*
    # and nothing else — an accident of routing, not a decision. Turn them off
    # explicitly so a Caddyfile change (or exposing the API directly) can't publish
    # them by surprise.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
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
    return {
        "tts_enabled": bool(settings.openai_api_key),
        "smart_assistant_enabled": llm_enabled(),
        # The free week comes from the recipe catalogue, so there is always a
        # planner; only remembering the week needs Mongo.
        "meal_plan_enabled": True,
        # Ce que l'app promet à l'utilisateur : « ce menu est mémorisé ».
        # Une URL configurée ne suffit pas — il faut qu'Atlas réponde.
        "meal_plan_saved": mongo_ready(),
        "environment": settings.environment,
    }


app.include_router(auth_router, prefix=API_V1)
app.include_router(users_router, prefix=API_V1)
app.include_router(fuel_router, prefix=API_V1)
app.include_router(products_router, prefix=API_V1)
app.include_router(stores_router, prefix=API_V1)
app.include_router(tts_router, prefix=API_V1)
app.include_router(shopping_router, prefix=API_V1)
app.include_router(smartcart_router, prefix=API_V1)
app.include_router(mealplan_router, prefix=API_V1)
app.include_router(billing_router, prefix=API_V1)
app.include_router(recipes_router, prefix=API_V1)
app.include_router(alerts_router, prefix=API_V1)
app.include_router(devices_router, prefix=API_V1)
app.include_router(feedback_router, prefix=API_V1)
app.include_router(analytics_router, prefix=API_V1)
