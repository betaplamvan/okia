"""Lỗi nghiệp vụ: trả `{code, message}`, message dịch theo locale của request (docs/11, 13)."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.i18n import resolve_locale, t


class AppError(Exception):
    def __init__(self, code: str, status: int = 400, **params: Any) -> None:
        super().__init__(code)
        self.code = code
        self.status = status
        self.params = params


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        locale = resolve_locale(
            getattr(request.state, "user_locale", None), request.headers.get("accept-language")
        )
        body: dict[str, Any] = {
            "code": exc.code,
            "message": t(f"errors.{exc.code}", locale, **exc.params),
        }
        if exc.params:
            body.update(exc.params)
        headers = {}
        if exc.code == "RATE_LIMITED" and "retryAfter" in exc.params:
            headers["Retry-After"] = str(exc.params["retryAfter"])
        return JSONResponse(body, status_code=exc.status, headers=headers)
