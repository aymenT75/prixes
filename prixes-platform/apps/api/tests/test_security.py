"""Password hashing + JWT token round-trips (app.core.security)."""
from __future__ import annotations

import uuid

import jwt
import pytest

from app.core.security import create_token, decode_token, hash_password, verify_password


def test_password_hash_roundtrip() -> None:
    h = hash_password("correct-horse-battery-staple")
    assert verify_password("correct-horse-battery-staple", h) is True


def test_password_hash_rejects_wrong_password() -> None:
    h = hash_password("correct-horse-battery-staple")
    assert verify_password("wrong-password", h) is False


def test_password_hash_is_not_plaintext() -> None:
    h = hash_password("hunter2")
    assert h != "hunter2"


def test_token_roundtrip() -> None:
    user_id = uuid.uuid4()
    token = create_token(user_id, "access")
    assert decode_token(token, "access") == user_id


def test_access_token_rejected_as_refresh() -> None:
    """A stolen access token must not work where a refresh token is expected."""
    token = create_token(uuid.uuid4(), "access")
    with pytest.raises(jwt.PyJWTError):
        decode_token(token, "refresh")


def test_garbage_token_rejected() -> None:
    with pytest.raises(jwt.PyJWTError):
        decode_token("not-a-real-token", "access")
