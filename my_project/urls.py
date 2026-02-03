from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import path, include
from django.views.generic import RedirectView
from users import views as user_views
from users import api as users_api
from django.conf import settings
from django.conf.urls.static import static
from blog import views as blog_views
from blog.api import PostViewSet, CommentViewSet, LivestreamViewSet, CommunityViewSet, trending_posts_view, increment_post_views
from payments import api as payments_api
from rest_framework.routers import DefaultRouter
from django.views.decorators.csrf import ensure_csrf_cookie
from django.http import JsonResponse
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView



router = DefaultRouter()
router.register(r'posts', PostViewSet, basename='post')
router.register(r'comments', CommentViewSet, basename='comment')
router.register(r'streams', LivestreamViewSet, basename='stream')
router.register(r'communities', CommunityViewSet, basename='community')


@ensure_csrf_cookie
def csrf_view(request):
    return JsonResponse({'detail': 'ok'})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('register/', user_views.register, name='register'),
    path('profile/', user_views.profile, name='profile'),
    path("logout/", user_views.logout_view, name="logout"),
    path('login/', auth_views.LoginView.as_view(template_name='users/login.html'), name='login'),
    path('post/<int:pk>/like/', user_views.LikeView, name='post-like'),
     path('post/<int:pk>/dislike/', user_views.DislikeView, name='post-dislike'),
    path('api/csrf/', csrf_view, name='api-csrf'),
    path('api/auth/user/', users_api.user_view, name='api-user'),
    path('api/auth/login/', users_api.login_view, name='api-login'),
    path('api/auth/logout/', users_api.logout_view, name='api-logout'),
    path('api/auth/register/', users_api.register_view, name='api-register'),
    path('api/users/following/', users_api.following_list_view, name='api-following-list'),
    path('api/users/<str:username>/', users_api.user_profile_view, name='api-user-profile'),
    path('api/users/<str:username>/follow/', users_api.follow_user_view, name='api-follow-user'),
    path('api/users/<str:username>/unfollow/', users_api.unfollow_user_view, name='api-unfollow-user'),
    path('api/suggestions/', users_api.suggested_users_view, name='api-suggestions'),
    path('api/explore/', users_api.explore_users_view, name='api-explore'),
    path('api/search/', users_api.search_view, name='api-search'),
    path('api/stats/', users_api.user_stats_view, name='api-user-stats'),
    path('api/activity/streak/', users_api.user_streak_view, name='api-user-streak'),
    path('api/activity/pulse/', users_api.community_pulse_view, name='api-community-pulse'),
    # Chat / Messaging API
    path('api/conversations/', users_api.conversations_view, name='api-conversations'),
    path('api/conversations/<uuid:conversation_id>/messages/', users_api.conversation_messages_view, name='api-conversation-messages'),
    path('api/conversations/<uuid:conversation_id>/action/', users_api.conversation_action_view, name='api-conversation-action'),
    path('api/messages/<uuid:message_id>/action/', users_api.message_action_view, name='api-message-action'),
    path('api/message-requests/', users_api.message_requests_view, name='api-message-requests'),
    path('api/unread-count/', users_api.unread_count_view, name='api-unread-count'),
    # E2EE Public Key API
    path('api/keys/', users_api.set_public_key, name='api-set-public-key'),
    path('api/keys/me/', users_api.get_my_public_key, name='api-get-my-public-key'),
    path('api/keys/<str:username>/', users_api.get_public_key, name='api-get-public-key'),
    # Achievements API
    path('api/achievements/pending/', users_api.pending_achievements_view, name='api-pending-achievements'),
    path('api/achievements/mark-shown/', users_api.mark_achievement_shown_view, name='api-mark-achievement-shown'),
    path('api/achievements/', users_api.all_achievements_view, name='api-all-achievements'),
    # Trending & Views API
    path('api/posts/trending/', trending_posts_view, name='api-trending-posts'),
    path('api/posts/<str:slug>/view/', increment_post_views, name='api-increment-views'),
    # Payments API
    path('api/payments/initialize/', payments_api.initialize_payment, name='api-initialize-payment'),
    path('api/payments/verify/<str:reference>/', payments_api.verify_payment, name='api-verify-payment'),
    path('api/payments/subscription/', payments_api.get_subscription, name='api-get-subscription'),
    path('api/payments/subscription/cancel/', payments_api.cancel_subscription, name='api-cancel-subscription'),
    path('api/payments/history/', payments_api.payment_history, name='api-payment-history'),
    path('api/payments/webhook/', payments_api.paystack_webhook, name='api-paystack-webhook'),
    path('api/', include(router.urls)),
    # API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    path('', RedirectView.as_view(url='/api/docs/', permanent=False), name='home'),  # Redirect to Swagger docs
    path('accounts/', include('allauth.urls'))
]

if settings.DEBUG:
 urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


