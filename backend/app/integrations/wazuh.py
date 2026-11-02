import httpx

from app.core.config import settings


class WazuhConnector:

    @property
    def base_url(self) -> str:
        return settings.wazuh_url

    async def authenticate(self) -> str:
        if not settings.WAZUH_USERNAME or not settings.WAZUH_PASSWORD:
            raise ValueError(
                "Wazuh credentials are not configured. Please set WAZUH_API_USERNAME "
                "and WAZUH_API_PASSWORD (or WAZUH_USERNAME and WAZUH_PASSWORD) in your .env file."
            )
        if not self.base_url:
            raise ValueError(
                "Wazuh API URL is not configured. Please set WAZUH_API_URL "
                "(or WAZUH_HOST and WAZUH_PORT) in your .env file."
            )

        async with httpx.AsyncClient(
            verify=settings.WAZUH_VERIFY_SSL,
            timeout=15.0
        ) as client:
            response = await client.post(
                f"{self.base_url}/security/user/authenticate",
                auth=(
                    settings.WAZUH_USERNAME,
                    settings.WAZUH_PASSWORD
                )
            )

            response.raise_for_status()

            data = response.json()

            return data["data"]["token"]

    async def get_manager_status(self):
        token = await self.authenticate()

        async with httpx.AsyncClient(
            verify=settings.WAZUH_VERIFY_SSL,
            timeout=15.0
        ) as client:
            response = await client.get(
                f"{self.base_url}/manager/status",
                headers={
                    "Authorization": f"Bearer {token}"
                }
            )

            response.raise_for_status()

            return response.json()

    async def get_agents(self, limit: int = 50):
        token = await self.authenticate()

        async with httpx.AsyncClient(
            verify=settings.WAZUH_VERIFY_SSL,
            timeout=15.0
        ) as client:
            response = await client.get(
                f"{self.base_url}/agents",
                headers={
                    "Authorization": f"Bearer {token}"
                },
                params={
                    "limit": limit
                }
            )

            response.raise_for_status()

            return response.json()


wazuh = WazuhConnector()