from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import UUID


def _uuid_or_none(value: Optional[str]) -> Optional[str]:
    if not value:
        return None

    try:
        return str(UUID(str(value).strip()))
    except (ValueError, TypeError):
        return None


def write_audit_log(
    admin_client,
    *,
    actor_id: Optional[str],
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    payload = {
        "actor_id": _uuid_or_none(actor_id),
        "action": action,
        "entity_type": entity_type,
        "entity_id": _uuid_or_none(entity_id),
        "metadata": metadata or {},
    }

    try:
        admin_client.table("audit_logs").insert(payload).execute()
    except Exception:
        # Best-effort operational telemetry; never break main request flow.
        return
