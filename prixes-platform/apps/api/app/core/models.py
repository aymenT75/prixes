"""Import all ORM models so Alembic autogenerate + Base.metadata see them."""
from app.core.db import Base
from app.domains.alerts.models import PriceAlert
from app.domains.analytics.models import AnalyticsEvent
from app.domains.deals.models import Deal, Report, Vote
from app.domains.devices.models import Device
from app.domains.feedback.models import Feedback
from app.domains.fuel.models import FuelStation
from app.domains.products.models import PricePoint, Product
from app.domains.shopping.models import ShoppingItem
from app.domains.users.models import User

__all__ = [
    "Base",
    "User",
    "Deal",
    "Vote",
    "Report",
    "Product",
    "PricePoint",
    "FuelStation",
    "ShoppingItem",
    "PriceAlert",
    "Device",
    "Feedback",
    "AnalyticsEvent",
]
