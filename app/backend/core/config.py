import logging
import os
from typing import Any

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    # =========================
    # Application
    # =========================
    app_name: str = "FastAPI Modular Template"
    debug: bool = False
    version: str = "1.0.0"

    # =========================
    # Server
    # =========================
    host: str = "0.0.0.0"
    port: int = 8000

    # =========================
    # Database (REQUIRED)
    # =========================
    database_url: str

    # =========================
    # AWS / Deployment
    # =========================
    is_lambda: bool = False
    lambda_function_name: str = "fastapi-backend"
    aws_region: str = "us-east-1"

    # =========================
    # Pydantic config
    # =========================
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"

    # =========================
    # Computed backend URL
    # =========================
    @property
    def backend_url(self) -> str:
        if self.is_lambda:
            return os.environ.get(
                "PYTHON_BACKEND_URL",
                f"https://{self.lambda_function_name}.execute-api.{self.aws_region}.amazonaws.com"
            )
        display_host = "127.0.0.1" if self.host == "0.0.0.0" else self.host
        return os.environ.get(
            "PYTHON_BACKEND_URL",
            f"http://{display_host}:{self.port}"
        )

    # =========================
    # Dynamic env fallback
    # =========================
    def __getattr__(self, name: str) -> Any:
        env_var_name = name.upper()

        if env_var_name in os.environ:
            value = os.environ[env_var_name]
            self.__dict__[name] = value
            logger.debug(f"Loaded {name} from env var {env_var_name}")
            return value

        raise AttributeError(
            f"'{self.__class__.__name__}' object has no attribute '{name}'"
        )


# =========================
# Global settings instance
# =========================
settings = Settings()