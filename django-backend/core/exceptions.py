import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Wraps DRF's default exception handler. DRF only converts APIException
    subclasses (ValidationError, NotAuthenticated, etc.) into a Response —
    anything else (a raw KeyError/TypeError/library error) is returned as
    None here, and Django's base handler then renders its own bare error
    page for it. That bare page isn't guaranteed to pass back through
    CorsMiddleware the same way a DRF Response does, so the frontend sees
    a CORS error instead of the real 500 and the actual bug never surfaces.

    Catching that case here means literally every API view — not just
    routes/plan-multi/ — always answers with a normal, CORS-safe JSON
    error, and the real traceback still gets logged server-side.
    """
    response = drf_exception_handler(exc, context)
    if response is not None:
        return response

    view = context.get("view")
    logger.exception("Unhandled exception in %s", getattr(view, "__class__", view))
    return Response({"error": "Internal server error. Please try again."}, status=500)
