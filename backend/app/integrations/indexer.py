import httpx

from app.core.config import (
    WAZUH_INDEXER_URL,
    WAZUH_INDEXER_USERNAME,
    WAZUH_INDEXER_PASSWORD,
    WAZUH_INDEXER_VERIFY_SSL,
    WAZUH_VERIFY_SSL,
)



class WazuhIndexer:

    def __init__(self):
        self.base_url = WAZUH_INDEXER_URL.rstrip("/")

    @property
    def configured(self) -> bool:
        return bool(self.base_url and WAZUH_INDEXER_USERNAME and WAZUH_INDEXER_PASSWORD)

    async def ping(self) -> dict:
        """Cheap reachability check: the cluster root returns name and version."""
        if not self.configured:
            raise ValueError("Wazuh Indexer configuration is incomplete")
        async with httpx.AsyncClient(verify=WAZUH_INDEXER_VERIFY_SSL, timeout=5.0) as client:
            response = await client.get(
                f"{self.base_url}/",
                auth=httpx.BasicAuth(WAZUH_INDEXER_USERNAME, WAZUH_INDEXER_PASSWORD),
            )
            response.raise_for_status()
            body = response.json()
            return {"version": (body.get("version") or {}).get("number")}

    async def get_alerts(self, limit: int = 50):

        if not all([
            self.base_url,
            WAZUH_INDEXER_USERNAME,
            WAZUH_INDEXER_PASSWORD
        ]):
            raise ValueError(
                "Wazuh Indexer configuration is incomplete"
            )

        query = {
            "size": min(max(limit, 1), 100),
            "sort": [
                {
                    "timestamp": {
                        "order": "desc"
                    }
                }
            ],
            "query": {
                "range": {
                    "timestamp": {
                        "gte": "now-24h",
                        "lte": "now"
                    }
                }
            }
        }

        async with httpx.AsyncClient(
            verify=WAZUH_INDEXER_VERIFY_SSL,
            timeout=30.0
        ) as client:


            response = await client.post(
                f"{self.base_url}/wazuh-alerts-*/_search",
                auth=httpx.BasicAuth(
                    WAZUH_INDEXER_USERNAME,
                    WAZUH_INDEXER_PASSWORD
                ),
                json=query
            )

            response.raise_for_status()

            result = response.json()

            hits = result.get("hits", {}).get("hits", [])

            return [
                {
                    "id": alert.get("_id"),
                    "index": alert.get("_index"),
                    **alert.get("_source", {})
                }
                for alert in hits
            ]


indexer = WazuhIndexer()