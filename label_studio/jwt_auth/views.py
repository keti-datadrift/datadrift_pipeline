import base64
import logging
from datetime import datetime, timedelta

from core.permissions import all_permissions
from django.contrib.auth import authenticate
from django.utils.decorators import method_decorator
from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema
from jwt_auth.auth import TokenAuthenticationPhaseout
from jwt_auth.models import JWTSettings, LSAPIToken, TruncatedLSAPIToken
from jwt_auth.serializers import (
    JWTSettingsSerializer,
    LSAPITokenCreateSerializer,
    LSAPITokenListSerializer,
    TokenRefreshResponseSerializer,
    TokenRotateResponseSerializer,
)
from rest_framework import generics, status
from rest_framework.authentication import SessionAuthentication, get_authorization_header
from rest_framework.exceptions import APIException
from rest_framework.generics import CreateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import TokenBackendError, TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView, TokenViewBase

logger = logging.getLogger(__name__)


class TokenExistsError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "You already have a valid token. Please revoke it before creating a new one."
    default_code = "token_exists"


@method_decorator(
    name="get",
    decorator=swagger_auto_schema(
        tags=["JWT"],
        operation_summary="Retrieve JWT Settings",
        operation_description="Retrieve JWT settings for the currently active organization.",
    ),
)
@method_decorator(
    name="post",
    decorator=swagger_auto_schema(
        tags=["JWT"],
        operation_summary="Update JWT Settings",
        operation_description="Update JWT settings for the currently active organization.",
    ),
)
class JWTSettingsAPI(CreateAPIView):
    queryset = JWTSettings.objects.all()
    serializer_class = JWTSettingsSerializer
    permission_required = all_permissions.organizations_view

    def get(self, request, *args, **kwargs):
        jwt_settings = request.user.active_organization.jwt
        # Check if user has view permission
        if not jwt_settings.has_view_permission(request.user):
            return Response(
                {"detail": "You do not have permission to view JWT settings"}, status=status.HTTP_403_FORBIDDEN
            )
        return Response(self.get_serializer(jwt_settings).data)

    def post(self, request, *args, **kwargs):
        jwt_settings = request.user.active_organization.jwt
        # Check if user has modify permission
        if not jwt_settings.has_modify_permission(request.user):
            return Response(
                {"detail": "You do not have permission to modify JWT settings"}, status=status.HTTP_403_FORBIDDEN
            )
        serializer = self.get_serializer(data=request.data, instance=jwt_settings)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# Recommended implementation from JWT to support drf-yasg:
# https://django-rest-framework-simplejwt.readthedocs.io/en/latest/drf_yasg_integration.html
class DecoratedTokenRefreshView(TokenRefreshView):
    @swagger_auto_schema(
        tags=["JWT"],
        responses={
            status.HTTP_200_OK: TokenRefreshResponseSerializer,
        },
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


@method_decorator(
    name="get",
    decorator=swagger_auto_schema(
        tags=["JWT"],
        operation_summary="List API tokens",
        operation_description="List all API tokens for the current user.",
    ),
)
@method_decorator(
    name="post",
    decorator=swagger_auto_schema(
        tags=["JWT"],
        operation_summary="Create API token",
        operation_description="Create a new API token for the current user.",
    ),
)
class LSAPITokenView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    token_class = LSAPIToken

    def get_queryset(self):
        """Returns all non-expired non-blacklisted tokens for the current user.

        The `list` method handles filtering for refresh tokens (as opposed to access tokens),
        since simple-jwt makes it hard to do this at the DB level."""
        # Notably, if the list of non-expired blacklisted tokens ever gets too long
        # (e.g. users from orgs who have not set a token expiration for their org
        # revoke enough tokens for this to blow up), this will become inefficient.
        # Would be ideal to just add a "blacklisted" attr to our own subclass of
        # OutstandingToken so we can check at that level, or just clean up
        # OutstandingTokens that have been blacklisted every so often.
        current_blacklisted_tokens = BlacklistedToken.objects.filter(token__expires_at__gt=datetime.now()).values_list(
            "token_id", flat=True
        )
        return OutstandingToken.objects.filter(user_id=self.request.user.id, expires_at__gt=datetime.now()).exclude(
            id__in=current_blacklisted_tokens
        )

    def list(self, request, *args, **kwargs):
        all_tokens = self.get_queryset()

        def _maybe_get_token(token: OutstandingToken):
            try:
                return TruncatedLSAPIToken(str(token.token))
            except (TokenError, TokenBackendError) as e:  # expired/invalid token
                logger.debug("JWT API token validation failed: %s", e)
                return None

        # Annoyingly, token_type not stored directly so we have to filter it here.
        # Shouldn't be many unexpired tokens to iterate through.
        token_objects = list(filter(None, [_maybe_get_token(token) for token in all_tokens]))
        refresh_tokens = [tok for tok in token_objects if tok["token_type"] == "refresh"]

        serializer = self.get_serializer(refresh_tokens, many=True)
        data = serializer.data
        return Response(data)

    def get_serializer_class(self):
        if self.request.method == "POST":
            return LSAPITokenCreateSerializer
        return LSAPITokenListSerializer

    def perform_create(self, serializer):
        # Check for existing valid tokens
        existing_tokens = self.get_queryset()
        if existing_tokens.exists():
            raise TokenExistsError()

        token = self.token_class.for_user(self.request.user)
        serializer.instance = token


class LSTokenBlacklistView(TokenViewBase):
    _serializer_class = "jwt_auth.serializers.LSAPITokenBlacklistSerializer"

    @swagger_auto_schema(
        tags=["JWT"],
        operation_summary="Blacklist a JWT refresh token",
        operation_description="Adds a JWT refresh token to the blacklist, preventing it from being used to obtain new access tokens.",
        responses={
            status.HTTP_204_NO_CONTENT: "Token was successfully blacklisted",
            status.HTTP_404_NOT_FOUND: "Token is already blacklisted",
        },
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            # Notably, simple jwt's serializer (which we inherit from) calls
            # .blacklist() on the token under the hood
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            logger.error("Token error occurred while trying to blacklist a token: %s", str(e), exc_info=True)
            return Response({"detail": "Token is invalid or already blacklisted."}, status=status.HTTP_404_NOT_FOUND)

        return Response(status=status.HTTP_204_NO_CONTENT)


class LSAPITokenRotateView(TokenViewBase):
    # Have to explicitly set authentication_classes here, due to how auth works in our middleware, request.user is not set
    # properly before executing the view.
    authentication_classes = [JWTAuthentication, TokenAuthenticationPhaseout, SessionAuthentication]
    permission_classes = [IsAuthenticated]
    _serializer_class = "jwt_auth.serializers.LSAPITokenRotateSerializer"
    token_class = LSAPIToken

    @swagger_auto_schema(
        tags=["JWT"],
        operation_summary="Rotate JWT refresh token",
        operation_description="Creates a new JWT refresh token and blacklists the current one.",
        responses={
            status.HTTP_200_OK: TokenRotateResponseSerializer,
            status.HTTP_400_BAD_REQUEST: "Invalid token or token already blacklisted",
        },
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Ensure the user is authenticated
        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "Authentication credentials were not provided or are invalid."}, status=401)

        current_token = serializer.validated_data["refresh"]

        # Blacklist the current token
        try:
            current_token.blacklist()
        except TokenError:
            return Response({"detail": "Token is invalid or already blacklisted."}, status=status.HTTP_400_BAD_REQUEST)

        # Create a new token for the user
        new_token = self.create_token(request.user)
        return Response({"refresh": new_token.get_full_jwt()}, status=status.HTTP_200_OK)

    def create_token(self, user):
        """Create a new token for the user. Can be overridden by child classes to use different token classes."""
        return self.token_class.for_user(user)


class ObtainRefreshTokenView(APIView):
    """
    Custom endpoint to obtain a refresh and access token using Basic Auth (email:password).
    """

    permission_classes = []
    authentication_classes = []

    @swagger_auto_schema(
        tags=["JWT"],
        operation_summary="Obtain refresh and access token with Basic Auth",
        responses={
            200: openapi.Response(
                description="Refresh and access token issued",
                schema=openapi.Schema(
                    type=openapi.TYPE_OBJECT,
                    properties={
                        "refresh": openapi.Schema(type=openapi.TYPE_STRING),
                        "access": openapi.Schema(type=openapi.TYPE_STRING),
                    },
                ),
            ),
            401: "Missing or invalid Basic Auth header",
            400: "Invalid credentials",
        },
    )
    def post(self, request):
        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != b"basic":
            return Response({"detail": "Missing or invalid Basic Auth header."}, status=401)
        try:
            auth_decoded = base64.b64decode(auth[1]).decode("utf-8")
            email, password = auth_decoded.split(":", 1)
        except Exception:
            return Response({"detail": "Invalid Basic Auth header."}, status=401)

        user = authenticate(email=email.lower(), password=password)
        if user is None or not user.is_active:
            return Response({"detail": "Invalid credentials"}, status=400)

        refresh = RefreshToken.for_user(user)

        if user.email == "qocr@admin.com":
            refresh.access_token.set_exp(lifetime=timedelta(days=365 * 10))
            refresh.set_exp(lifetime=timedelta(days=365 * 10))

        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        resp = Response({"detail": "Login successful"})
        # 쿠키 설정 (1일, 7일 유효)
        resp.set_cookie("ls_access_token", access_token, httponly=True, samesite="Lax", max_age=60 * 60 * 24)
        resp.set_cookie("ls_refresh_token", refresh_token, httponly=True, samesite="Lax", max_age=60 * 60 * 24 * 7)

        return resp
