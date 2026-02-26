import json
import time
import uuid
import logging


logger = logging.getLogger("request")


class RequestLogMiddleware:
    """Attach request ID and emit a structured access log entry."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.request_id = request_id
        start = time.monotonic()

        try:
            response = self.get_response(request)
            status_code = getattr(response, "status_code", 200)
        except Exception as exc:
            duration_ms = int((time.monotonic() - start) * 1000)
            logger.error(
                json.dumps(
                    {
                        "event": "request",
                        "method": request.method,
                        "path": request.path,
                        "status": 500,
                        "duration_ms": duration_ms,
                        "request_id": request_id,
                        "error": str(exc),
                    }
                )
            )
            raise

        duration_ms = int((time.monotonic() - start) * 1000)
        response["X-Request-ID"] = request_id
        logger.info(
            json.dumps(
                {
                    "event": "request",
                    "method": request.method,
                    "path": request.path,
                    "status": status_code,
                    "duration_ms": duration_ms,
                    "request_id": request_id,
                }
            )
        )
        return response
