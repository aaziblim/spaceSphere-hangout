"""
WebSocket authentication middleware for Django Channels.
Authenticates users using JWT tokens passed as query parameters.
"""

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from django.http import HttpResponseForbidden
from django.conf import settings
from urllib.parse import parse_qs
import jwt

User = get_user_model()


@database_sync_to_async
def get_user_from_token(token):
    """Decode JWT token and return the corresponding user."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        user_id = payload.get('user_id')
        if user_id:
            return User.objects.get(id=user_id)
    except jwt.ExpiredSignatureError:
        return AnonymousUser()
    except jwt.InvalidTokenError:
        return AnonymousUser()
    except User.DoesNotExist:
        return AnonymousUser()
    return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Custom middleware that authenticates WebSocket connections using JWT.
    Token should be passed as a query parameter: ws://...?token=<jwt_token>
    """

    async def __call__(self, scope, receive, send):
        # Parse query string to get the token
        query_string = scope.get('query_string', b'').decode()
        query_params = parse_qs(query_string)
        token = query_params.get('token', [None])[0]

        if token:
            scope['user'] = await get_user_from_token(token)
        else:
            scope['user'] = AnonymousUser()

        return await super().__call__(scope, receive, send)


class AdminIPAllowlistMiddleware:
    """Restrict /admin/ access to allowed IPs (e.g., Tailscale)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if settings.ADMIN_IP_RESTRICT and request.path.startswith('/admin/'):
            client_ip = self._get_client_ip(request)
            if client_ip not in getattr(settings, 'ADMIN_ALLOWED_IPS', []):
                return HttpResponseForbidden('Admin access restricted.')
        return self.get_response(request)

    def _get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        x_real_ip = request.META.get('HTTP_X_REAL_IP')
        if x_real_ip:
            return x_real_ip.strip()
        return request.META.get('REMOTE_ADDR', '')
