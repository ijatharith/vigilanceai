import os
from pathlib import Path
from dotenv import load_dotenv

# Ensure .env from backend directory is loaded
backend_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=backend_dir / ".env")
load_dotenv()


class Settings:
    # Wazuh Manager API
    WAZUH_API_URL: str = os.getenv("WAZUH_API_URL", "")
    WAZUH_HOST: str = os.getenv("WAZUH_HOST", "")
    WAZUH_PORT: str = os.getenv("WAZUH_PORT", "55000")

    WAZUH_USERNAME: str = (
        os.getenv("WAZUH_API_USERNAME")
        or os.getenv("WAZUH_USERNAME")
        or ""
    )
    WAZUH_PASSWORD: str = (
        os.getenv("WAZUH_API_PASSWORD")
        or os.getenv("WAZUH_PASSWORD")
        or ""
    )

    # Self-signed certificate in Wazuh lab/VM requires verify=False unless custom CA is configured
    WAZUH_VERIFY_SSL: bool = (
        os.getenv("WAZUH_VERIFY_SSL", "false").lower() in ("true", "1", "yes")
    )

    # Wazuh Indexer (OpenSearch / Elasticsearch)
    WAZUH_INDEXER_URL: str = os.getenv("WAZUH_INDEXER_URL", "https://127.0.0.1:9200")
    WAZUH_INDEXER_USERNAME: str = os.getenv("WAZUH_INDEXER_USERNAME", "admin")
    WAZUH_INDEXER_PASSWORD: str = os.getenv("WAZUH_INDEXER_PASSWORD", "")
    WAZUH_INDEXER_VERIFY_SSL: bool = (
        os.getenv("WAZUH_INDEXER_VERIFY_SSL", "false").lower() in ("true", "1", "yes")
    )

    @property
    def wazuh_url(self) -> str:
        if self.WAZUH_API_URL:
            return self.WAZUH_API_URL.rstrip("/")
        if self.WAZUH_HOST:
            return f"https://{self.WAZUH_HOST}:{self.WAZUH_PORT}".rstrip("/")
        return ""


settings = Settings()

# Module-level exports for direct imports
WAZUH_API_URL = settings.wazuh_url
WAZUH_API_USERNAME = settings.WAZUH_USERNAME
WAZUH_API_PASSWORD = settings.WAZUH_PASSWORD
WAZUH_VERIFY_SSL = settings.WAZUH_VERIFY_SSL

WAZUH_INDEXER_URL = settings.WAZUH_INDEXER_URL
WAZUH_INDEXER_USERNAME = settings.WAZUH_INDEXER_USERNAME
WAZUH_INDEXER_PASSWORD = settings.WAZUH_INDEXER_PASSWORD
WAZUH_INDEXER_VERIFY_SSL = settings.WAZUH_INDEXER_VERIFY_SSL
