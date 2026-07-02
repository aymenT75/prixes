"""Uploads — issue presigned S3/R2 PUT URLs so clients upload photos directly."""
from __future__ import annotations

import uuid
from typing import Annotated, Literal

import boto3
from botocore.config import Config
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import CurrentUser

router = APIRouter(prefix="/uploads", tags=["uploads"])

_ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class PresignOut(BaseModel):
    upload_url: str
    public_url: str
    key: str


def _s3():  # noqa: ANN202
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        config=Config(signature_version="s3v4"),
    )


@router.post("/presign", response_model=PresignOut)
async def presign(
    user: CurrentUser,
    content_type: Annotated[Literal["image/jpeg", "image/png", "image/webp"], Query()],
) -> PresignOut:
    if content_type not in _ALLOWED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported content type")
    key = f"deals/{user.id}/{uuid.uuid4()}.{_ALLOWED[content_type]}"
    url = _s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.s3_bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=900,
    )
    public = f"{settings.s3_public_base_url.rstrip('/')}/{key}"
    return PresignOut(upload_url=url, public_url=public, key=key)
