from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework import serializers
from rest_framework.throttling import ScopedRateThrottle
from users.models import Profile, Follow, UserPublicKey, UserSettings, Block, Mute, Report
from django.db.models import Count, Q
from drf_spectacular.utils import (
    extend_schema,
    inline_serializer,
    OpenApiParameter,
    OpenApiResponse,
)
from typing import Optional, List
import logging

logger = logging.getLogger(__name__)


def _get_request_ip(request):
    """Extract client IP from request."""
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '')


class ProfileSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = ['image', 'bio', 'email_verified']

    def get_image(self, obj) -> Optional[str]:
        if not obj.image:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'profile']
        read_only_fields = ['id', 'username']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField(required=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password']

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
        )
        return user


@extend_schema(
    methods=['GET'],
    responses=UserSerializer,
)
@extend_schema(
    methods=['PATCH'],
    request=inline_serializer(
        name='UserUpdateRequest',
        fields={
            'first_name': serializers.CharField(required=False),
            'last_name': serializers.CharField(required=False),
            'email': serializers.EmailField(required=False),
            'bio': serializers.CharField(required=False),
            'image': serializers.ImageField(required=False),
        },
    ),
    responses=UserSerializer,
)
@api_view(['GET', 'PATCH'])
@permission_classes([permissions.IsAuthenticated])
def user_view(request):
    """Get or update the current user."""
    if request.method == 'GET':
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data)

    elif request.method == 'PATCH':
        user = request.user
        # Update user fields
        if 'first_name' in request.data:
            user.first_name = request.data['first_name']
        if 'last_name' in request.data:
            user.last_name = request.data['last_name']
        if 'email' in request.data:
            user.email = request.data['email']
        user.save()

        # Update profile fields
        profile = user.profile
        if 'bio' in request.data:
            profile.bio = request.data['bio']
        if 'image' in request.FILES:
            profile.image = request.FILES['image']
        profile.save()

        serializer = UserSerializer(user, context={'request': request})
        return Response(serializer.data)


@extend_schema(
    request=inline_serializer(
        name='LoginRequest',
        fields={
            'username': serializers.CharField(),
            'password': serializers.CharField(),
        },
    ),
    responses={
        200: UserSerializer,
        400: OpenApiResponse(description='Username and password are required.'),
        401: OpenApiResponse(description='Invalid credentials.'),
    },
)
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
@throttle_classes([ScopedRateThrottle])
def login_view(request):
    """Log in a user."""
    request.throttle_scope = 'login'
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response(
            {'detail': 'Username and password are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = authenticate(request, username=username, password=password)
    if user is None:
        logger.warning(
            'Failed login attempt for username=%s ip=%s',
            username,
            _get_request_ip(request),
        )
        return Response(
            {'detail': 'Invalid credentials.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    login(request, user)
    logger.info('Successful login for username=%s', username)
    serializer = UserSerializer(user, context={'request': request})
    return Response(serializer.data)


@extend_schema(
    methods=['POST'],
    responses=inline_serializer(
        name='LogoutResponse',
        fields={'detail': serializers.CharField()},
    )
)
@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def logout_view(request):
    """Log out the current user."""
    logout(request)
    return Response({'detail': 'Logged out.'})


@extend_schema(
    request=inline_serializer(
        name='PasswordChangeRequest',
        fields={
            'current_password': serializers.CharField(),
            'new_password': serializers.CharField(),
        },
    ),
    responses={
        200: OpenApiResponse(description='Password changed successfully.'),
        400: OpenApiResponse(description='Validation error.'),
    },
)
@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def password_change_view(request):
    """Change the current user's password."""
    request.throttle_scope = 'password_change'
    current_password = request.data.get('current_password')
    new_password = request.data.get('new_password')

    if not current_password or not new_password:
        return Response(
            {'detail': 'Both current_password and new_password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not request.user.check_password(current_password):
        return Response(
            {'detail': 'Current password is incorrect.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        validate_password(new_password, user=request.user)
    except Exception as e:
        return Response(
            {'detail': list(e.messages)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    request.user.set_password(new_password)
    request.user.save()
    # Re-login so the session stays valid after password change
    login(request, request.user, backend='django.contrib.auth.backends.ModelBackend')
    logger.info('Password changed for username=%s', request.user.username)
    return Response({'detail': 'Password changed successfully.'})


@extend_schema(
    request=RegisterSerializer,
    responses={201: UserSerializer, 400: OpenApiResponse(description='Validation error')},
)
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
@throttle_classes([ScopedRateThrottle])
def register_view(request):
    """Register a new user."""
    request.throttle_scope = 'register'
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        login(request, user, backend='django.contrib.auth.backends.ModelBackend')
        logger.info('New user registered: username=%s', user.username)
        try:
            send_verification_email(user)
        except Exception:
            logger.exception('Failed to send verification email for user=%s', user.username)
        return Response(UserSerializer(user, context={'request': request}).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserProfileSerializer(serializers.ModelSerializer):
    profile_image = serializers.SerializerMethodField()
    bio = serializers.SerializerMethodField()
    posts_count = serializers.SerializerMethodField()
    followers_count = serializers.SerializerMethodField()
    following_count = serializers.SerializerMethodField()
    posts = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'profile_image', 'bio', 'posts_count', 'followers_count', 'following_count', 'posts']

    def get_profile_image(self, obj) -> Optional[str]:
        profile = getattr(obj, 'profile', None)
        image = getattr(profile, 'image', None)
        if not image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(image.url)
        return image.url

    def get_bio(self, obj) -> str:
        profile = getattr(obj, 'profile', None)
        return getattr(profile, 'bio', '') or ''

    def get_posts_count(self, obj) -> int:
        return obj.post_set.count()

    def get_followers_count(self, obj) -> int:
        return obj.followers.count()

    def get_following_count(self, obj) -> int:
        return obj.following.count()

    def get_posts(self, obj) -> List[dict]:
        from blog.api import PostSerializer
        from django.db.models import Count
        posts = (
            obj.post_set
            .select_related('author', 'author__profile', 'community')
            .prefetch_related('likes', 'dislikes')
            .annotate(
                likes_count=Count('likes', distinct=True),
                dislikes_count=Count('dislikes', distinct=True),
                comments_count=Count('comments', distinct=True),
            )
            .order_by('-date_posted')[:12]
        )
        return PostSerializer(posts, many=True, context=self.context).data


class UserProfileResponseSerializer(UserProfileSerializer):
    is_following = serializers.BooleanField()

    class Meta(UserProfileSerializer.Meta):
        fields = UserProfileSerializer.Meta.fields + ['is_following']


@extend_schema(
    parameters=[OpenApiParameter(name='username', type=str, location=OpenApiParameter.PATH)],
    responses=UserProfileResponseSerializer,
)
@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def user_profile_view(request, username):
    """Get a user's public profile."""
    try:
        user = User.objects.select_related('profile').get(username=username)
    except User.DoesNotExist:
        return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
    
    # If the viewing user has blocked or been blocked by this user, deny access
    if request.user.is_authenticated and request.user != user:
        is_blocked = Block.objects.filter(
            Q(blocker=request.user, blocked=user) |
            Q(blocker=user, blocked=request.user)
        ).exists()
        if is_blocked:
            return Response({'detail': 'This user is not available.', 'is_blocked': True}, status=status.HTTP_403_FORBIDDEN)
    
    serializer = UserProfileSerializer(user, context={'request': request})
    data = serializer.data
    
    # Add is_following field if user is authenticated
    if request.user.is_authenticated and request.user != user:
        data['is_following'] = Follow.objects.filter(
            follower=request.user,
            following=user
        ).exists()
    else:
        data['is_following'] = False
    
    return Response(data)


@extend_schema(
    parameters=[OpenApiParameter(name='username', type=str, location=OpenApiParameter.PATH)],
    responses=inline_serializer(
        name='FollowResponse',
        fields={
            'detail': serializers.CharField(),
            'is_following': serializers.BooleanField(),
            'followers_count': serializers.IntegerField(),
        },
    ),
)
@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def follow_user_view(request, username):
    """Follow a user."""
    try:
        user_to_follow = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
    
    if request.user == user_to_follow:
        return Response({'detail': 'You cannot follow yourself.'}, status=status.HTTP_400_BAD_REQUEST)
    
    follow, created = Follow.objects.get_or_create(
        follower=request.user,
        following=user_to_follow
    )
    
    if created:
        create_notification(user_to_follow, request.user, 'follow')
        return Response({
            'detail': f'Now following {username}.',
            'is_following': True,
            'followers_count': user_to_follow.followers.count()
        })
    else:
        return Response({
            'detail': f'Already following {username}.',
            'is_following': True,
            'followers_count': user_to_follow.followers.count()
        })


@extend_schema(
    parameters=[OpenApiParameter(name='username', type=str, location=OpenApiParameter.PATH)],
    responses=inline_serializer(
        name='UnfollowResponse',
        fields={
            'detail': serializers.CharField(),
            'is_following': serializers.BooleanField(),
            'followers_count': serializers.IntegerField(),
        },
    ),
)
@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def unfollow_user_view(request, username):
    """Unfollow a user."""
    try:
        user_to_unfollow = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
    
    deleted, _ = Follow.objects.filter(
        follower=request.user,
        following=user_to_unfollow
    ).delete()
    
    return Response({
        'detail': f'Unfollowed {username}.' if deleted else f'Was not following {username}.',
        'is_following': False,
        'followers_count': user_to_unfollow.followers.count()
    })


class SuggestionUserSerializer(serializers.ModelSerializer):
    profile_image = serializers.SerializerMethodField()
    followers_count = serializers.SerializerMethodField()
    bio = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'profile_image', 'followers_count', 'bio']

    def get_profile_image(self, obj) -> Optional[str]:
        profile = getattr(obj, 'profile', None)
        image = getattr(profile, 'image', None)
        if not image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(image.url)
        return image.url

    def get_followers_count(self, obj) -> int:
        return obj.followers.count()
    
    def get_bio(self, obj) -> str:
        profile = getattr(obj, 'profile', None)
        return getattr(profile, 'bio', '') or ''


@extend_schema(responses=SuggestionUserSerializer(many=True))
@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def suggested_users_view(request):
    """Get suggested users to follow."""
    # Get users with most followers, excluding the current user
    users = User.objects.select_related('profile').annotate(
        follower_count=Count('followers')
    ).order_by('-follower_count')
    
    if request.user.is_authenticated:
        # Exclude current user and users already followed
        following_ids = Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
        blocked_ids = set(Block.objects.filter(blocker=request.user).values_list('blocked_id', flat=True))
        blocked_by_ids = set(Block.objects.filter(blocked=request.user).values_list('blocker_id', flat=True))
        exclude_ids = {request.user.id} | set(following_ids) | blocked_ids | blocked_by_ids
        users = users.exclude(id__in=exclude_ids)
    
    users = users[:5]  # Limit to 5 suggestions
    
    serializer = SuggestionUserSerializer(users, many=True, context={'request': request})
    return Response(serializer.data)


@extend_schema(
    responses=inline_serializer(
        name='UserStatsResponse',
        fields={
            'username': serializers.CharField(),
            'profile_image': serializers.CharField(allow_null=True),
            'posts_count': serializers.IntegerField(),
            'karma': serializers.IntegerField(),
            'followers_count': serializers.IntegerField(),
            'following_count': serializers.IntegerField(),
        },
    )
)
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def user_stats_view(request):
    """Get current user's stats for sidebar."""
    user = request.user
    
    # Calculate karma (sum of likes - dislikes across all posts)
    from blog.models import Post
    user_posts = Post.objects.filter(author=user)
    total_likes = sum(post.total_likes for post in user_posts)
    total_dislikes = sum(post.total_dislikes for post in user_posts)
    karma = total_likes - total_dislikes
    
    # Get profile image
    profile_image = None
    if hasattr(user, 'profile') and user.profile.image:
        profile_image = request.build_absolute_uri(user.profile.image.url)
    
    return Response({
        'username': user.username,
        'profile_image': profile_image,
        'posts_count': user_posts.count(),
        'karma': karma,
        'followers_count': user.followers.count(),
        'following_count': user.following.count(),
    })


@extend_schema(responses=SuggestionUserSerializer(many=True))
@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def explore_users_view(request):
    """Get all users for the explore page."""
    # Get all users ordered by follower count
    users = User.objects.select_related('profile').annotate(
        follower_count=Count('followers')
    ).order_by('-follower_count')
    
    if request.user.is_authenticated:
        blocked_ids = set(Block.objects.filter(blocker=request.user).values_list('blocked_id', flat=True))
        blocked_by_ids = set(Block.objects.filter(blocked=request.user).values_list('blocker_id', flat=True))
        exclude_ids = {request.user.id} | blocked_ids | blocked_by_ids
        users = users.exclude(id__in=exclude_ids)
    
    users = users[:20]  # Limit to 20 users
    
    serializer = SuggestionUserSerializer(users, many=True, context={'request': request})
    return Response(serializer.data)


# ============ SEARCH API ============

class SearchPostSerializer(serializers.ModelSerializer):
    """Minimal post serializer for search results."""
    author = SuggestionUserSerializer(read_only=True)
    post_image_url = serializers.SerializerMethodField()
    likes_count = serializers.SerializerMethodField()
    comments_count = serializers.SerializerMethodField()

    class Meta:
        from blog.models import Post
        model = Post
        fields = ['id', 'public_id', 'slug', 'title', 'content', 'post_image_url', 'date_posted', 'author', 'likes_count', 'comments_count']

    def get_post_image_url(self, obj) -> Optional[str]:
        if not obj.post_image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.post_image.url)
        return obj.post_image.url

    def get_likes_count(self, obj) -> int:
        return obj.likes.count()

    def get_comments_count(self, obj) -> int:
        return obj.comments.count()


@extend_schema(
    parameters=[OpenApiParameter(name='q', type=str, location=OpenApiParameter.QUERY)],
    responses=inline_serializer(
        name='SearchResponse',
        fields={
            'users': SuggestionUserSerializer(many=True),
            'posts': SearchPostSerializer(many=True),
        },
    )
)
@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def search_view(request):
    """Search for users and posts."""
    from blog.models import Post
    
    query = request.GET.get('q', '').strip()
    
    # Return empty results if query is too short
    if len(query) < 2:
        return Response({'users': [], 'posts': []})
    
    # Search users by username, first_name, last_name
    users = User.objects.filter(
        Q(username__icontains=query) |
        Q(first_name__icontains=query) |
        Q(last_name__icontains=query)
    ).select_related('profile').annotate(
        follower_count=Count('followers')
    ).order_by('-follower_count')
    
    if request.user.is_authenticated:
        blocked_ids = set(Block.objects.filter(blocker=request.user).values_list('blocked_id', flat=True))
        blocked_by_ids = set(Block.objects.filter(blocked=request.user).values_list('blocker_id', flat=True))
        exclude_ids = {request.user.id} | blocked_ids | blocked_by_ids
        users = users.exclude(id__in=exclude_ids)
    
    users = users[:10]  # Limit to 10 user results
    
    # Search posts by title and content
    posts = Post.objects.filter(
        Q(title__icontains=query) |
        Q(content__icontains=query)
    ).select_related('author', 'author__profile').order_by('-date_posted')
    
    if request.user.is_authenticated:
        blocked_ids = set(Block.objects.filter(blocker=request.user).values_list('blocked_id', flat=True))
        blocked_by_ids = set(Block.objects.filter(blocked=request.user).values_list('blocker_id', flat=True))
        all_blocked = blocked_ids | blocked_by_ids
        if all_blocked:
            posts = posts.exclude(author_id__in=all_blocked)
    
    posts = posts[:10]
    
    return Response({
        'users': SuggestionUserSerializer(users, many=True, context={'request': request}).data,
        'posts': SearchPostSerializer(posts, many=True, context={'request': request}).data
    })


@extend_schema(responses=SuggestionUserSerializer(many=True))
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def following_list_view(request):
    """Get list of users the current user is following."""
    following = Follow.objects.filter(follower=request.user).select_related('following', 'following__profile')
    users = [f.following for f in following]
    serializer = SuggestionUserSerializer(users, many=True, context={'request': request})
    return Response(serializer.data)


# ============ CHAT / MESSAGING API ============

from users.models import Conversation, DirectMessage
from django.utils import timezone


class ChatParticipantSerializer(serializers.ModelSerializer):
    """Minimal user info for chat"""
    profile_image = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()
    last_seen = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'profile_image', 'is_online', 'last_seen']
    
    def get_profile_image(self, obj) -> Optional[str]:
        profile = getattr(obj, 'profile', None)
        image = getattr(profile, 'image', None)
        if not image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(image.url)
        return image.url
    
    def get_is_online(self, obj) -> bool:
        profile = getattr(obj, 'profile', None)
        if profile:
            return profile.is_online
        return False
    
    def get_last_seen(self, obj) -> Optional[str]:
        profile = getattr(obj, 'profile', None)
        if profile and profile.last_seen:
            return profile.last_seen.isoformat()
        return None


class DirectMessageSerializer(serializers.ModelSerializer):
    """Serializer for chat messages"""
    sender = ChatParticipantSerializer(read_only=True)
    
    class Meta:
        model = DirectMessage
        fields = [
            'id', 'conversation', 'sender', 'content', 'created_at', 
            'read_at', 'message_type', 'attachment_url', 'shared_post_id', 'is_unsent',
            'is_encrypted'  # E2EE: True if content is ciphertext
        ]
        read_only_fields = ['id', 'sender', 'created_at', 'read_at']


class ConversationSerializer(serializers.ModelSerializer):
    """Serializer for conversations"""
    participants = ChatParticipantSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Conversation
        fields = [
            'id', 'participants', 'last_message', 'unread_count', 
            'updated_at', 'is_request', 'request_status'
        ]
    
    def get_last_message(self, obj) -> Optional[dict]:
        last_msg = obj.get_last_message()
        if last_msg:
            return DirectMessageSerializer(last_msg, context=self.context).data
        return None
    
    def get_unread_count(self, obj) -> int:
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.get_unread_count(request.user)
        return 0


@extend_schema(
    methods=['GET'],
    responses=ConversationSerializer(many=True),
)
@extend_schema(
    methods=['POST'],
    request=inline_serializer(
        name='ConversationCreateRequest',
        fields={'username': serializers.CharField()},
    ),
    responses={201: ConversationSerializer, 400: OpenApiResponse(description='Validation error')},
)
@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAuthenticated])
def conversations_view(request):
    """
    GET: List all conversations for the current user
    POST: Start a new conversation with a user
    """
    if request.method == 'GET':
        conversations = Conversation.objects.filter(
            participants=request.user
        ).prefetch_related('participants', 'participants__profile', 'messages')
        
        serializer = ConversationSerializer(conversations, many=True, context={'request': request})
        return Response(serializer.data)
    
    elif request.method == 'POST':
        # Start a new conversation
        recipient_username = request.data.get('username')
        if not recipient_username:
            return Response({'error': 'Username is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            recipient = User.objects.get(username=recipient_username)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if recipient == request.user:
            return Response({'error': 'Cannot message yourself'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Block check: cannot message blocked users
        is_blocked = Block.objects.filter(
            Q(blocker=request.user, blocked=recipient) |
            Q(blocker=recipient, blocked=request.user)
        ).exists()
        if is_blocked:
            return Response({'error': 'Cannot message this user.'}, status=status.HTTP_403_FORBIDDEN)
        
        # Check if conversation already exists between these two users
        existing = Conversation.objects.filter(participants=request.user).filter(participants=recipient)
        if existing.exists():
            convo = existing.first()
            serializer = ConversationSerializer(convo, context={'request': request})
            return Response(serializer.data)
        
        # Check if recipient follows the sender (for message request logic)
        is_follower = Follow.objects.filter(follower=recipient, following=request.user).exists()
        
        # Create new conversation
        convo = Conversation.objects.create(
            is_request=not is_follower,
            request_status='pending' if not is_follower else 'accepted'
        )
        convo.participants.add(request.user, recipient)
        
        serializer = ConversationSerializer(convo, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(
    methods=['GET'],
    responses=DirectMessageSerializer(many=True),
)
@extend_schema(
    methods=['POST'],
    request=inline_serializer(
        name='ConversationMessageCreateRequest',
        fields={
            'content': serializers.CharField(required=False),
            'message_type': serializers.CharField(required=False),
            'attachment_url': serializers.CharField(required=False, allow_null=True),
            'shared_post_id': serializers.IntegerField(required=False, allow_null=True),
            'is_encrypted': serializers.BooleanField(required=False),
        },
    ),
    responses={201: DirectMessageSerializer, 400: OpenApiResponse(description='Validation error')},
)
@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAuthenticated])
def conversation_messages_view(request, conversation_id):
    """
    GET: Get messages in a conversation
    POST: Send a message to a conversation
    """
    try:
        conversation = Conversation.objects.get(id=conversation_id, participants=request.user)
    except Conversation.DoesNotExist:
        return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        messages = conversation.messages.select_related('sender', 'sender__profile').order_by('created_at')
        
        # Mark messages as read
        unread = messages.filter(read_at__isnull=True).exclude(sender=request.user)
        unread.update(read_at=timezone.now())
        
        serializer = DirectMessageSerializer(messages, many=True, context={'request': request})
        return Response(serializer.data)
    
    elif request.method == 'POST':
        content = request.data.get('content', '').strip()
        message_type = request.data.get('message_type', 'text')
        attachment_url = request.data.get('attachment_url')
        shared_post_id = request.data.get('shared_post_id')
        is_encrypted = request.data.get('is_encrypted', False)  # E2EE support
        
        if not content and message_type == 'text':
            return Response({'error': 'Message cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
        
        # For encrypted messages, allow larger content (base64 overhead)
        max_length = 10000 if is_encrypted else 5000
        if len(content) > max_length:
            return Response({'error': 'Message too long'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Create message
        message = DirectMessage.objects.create(
            conversation=conversation,
            sender=request.user,
            content=content,
            message_type=message_type,
            attachment_url=attachment_url,
            shared_post_id=shared_post_id,
            is_encrypted=is_encrypted  # E2EE flag
        )
        
        # Update conversation timestamp
        conversation.updated_at = timezone.now()
        conversation.save(update_fields=['updated_at'])
        
        # If this was a message request, auto-accept it when recipient replies
        if conversation.is_request and conversation.request_status == 'pending':
            other_user = conversation.get_other_participant(request.user)
            # If the original recipient (not the requester) is replying, accept it
            if other_user and conversation.messages.exclude(sender=request.user).exists():
                conversation.request_status = 'accepted'
                conversation.save(update_fields=['request_status'])
        
        serializer = DirectMessageSerializer(message, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(
    request=inline_serializer(
        name='MessageActionRequest',
        fields={'action': serializers.CharField()},
    ),
    responses=inline_serializer(
        name='MessageActionResponse',
        fields={'detail': serializers.CharField(required=False), 'error': serializers.CharField(required=False)},
    )
)
@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def message_action_view(request, message_id):
    """Perform actions on a message (unsend, react)"""
    try:
        message = DirectMessage.objects.get(id=message_id, sender=request.user)
    except DirectMessage.DoesNotExist:
        return Response({'error': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)
    
    action = request.data.get('action')
    
    if action == 'unsend':
        message.is_unsent = True
        message.content = ''  # Clear content
        message.save(update_fields=['is_unsent', 'content'])
        return Response({'detail': 'Message unsent'})
    
    return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(
    request=inline_serializer(
        name='ConversationActionRequest',
        fields={'action': serializers.CharField()},
    ),
    responses=inline_serializer(
        name='ConversationActionResponse',
        fields={'detail': serializers.CharField(required=False), 'error': serializers.CharField(required=False)},
    )
)
@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def conversation_action_view(request, conversation_id):
    """Perform actions on a conversation (accept/decline request, delete)"""
    try:
        conversation = Conversation.objects.get(id=conversation_id, participants=request.user)
    except Conversation.DoesNotExist:
        return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
    
    action = request.data.get('action')
    
    if action == 'accept':
        conversation.request_status = 'accepted'
        conversation.save(update_fields=['request_status'])
        return Response({'detail': 'Request accepted'})
    
    elif action == 'decline':
        conversation.request_status = 'declined'
        conversation.save(update_fields=['request_status'])
        return Response({'detail': 'Request declined'})
    
    elif action == 'delete':
        conversation.delete()
        return Response({'detail': 'Conversation deleted'})
    
    return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(responses=ConversationSerializer(many=True))
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def message_requests_view(request):
    """Get pending message requests"""
    requests = Conversation.objects.filter(
        participants=request.user,
        is_request=True,
        request_status='pending'
    ).prefetch_related('participants', 'participants__profile', 'messages')
    
    # Only return requests where the current user is NOT the initiator
    # (i.e., they didn't send the first message)
    result = []
    for convo in requests:
        first_message = convo.messages.order_by('created_at').first()
        if first_message and first_message.sender != request.user:
            result.append(convo)
    
    serializer = ConversationSerializer(result, many=True, context={'request': request})
    return Response(serializer.data)


@extend_schema(
    responses=inline_serializer(
        name='UnreadCountResponse',
        fields={'unread_count': serializers.IntegerField()},
    )
)
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def unread_count_view(request):
    """Get total unread message count for the current user"""
    count = DirectMessage.objects.filter(
        conversation__participants=request.user,
        read_at__isnull=True
    ).exclude(sender=request.user).count()
    
    return Response({'unread_count': count})


# ============ ACTIVITY / STREAK API ============

from users.models import UserActivity
from datetime import timedelta


@extend_schema(
    responses=inline_serializer(
        name='UserStreakResponse',
        fields={
            'days': serializers.ListField(child=serializers.BooleanField()),
            'current_streak': serializers.IntegerField(),
            'week_start': serializers.CharField(),
        },
    )
)
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def user_streak_view(request):
    """
    Get user's weekly activity streak.
    Also auto-records today's visit when called.
    """
    user = request.user
    today = timezone.now().date()
    
    # Record today's activity (get_or_create to avoid duplicates)
    UserActivity.objects.get_or_create(user=user, date=today)
    
    # Get the start of the current week (Monday)
    # weekday() returns 0 for Monday, 6 for Sunday
    days_since_monday = today.weekday()
    week_start = today - timedelta(days=days_since_monday)
    
    # Get all activity records for this week
    week_activities = UserActivity.objects.filter(
        user=user,
        date__gte=week_start,
        date__lte=today
    ).values_list('date', flat=True)
    
    activity_dates = set(week_activities)
    
    # Build array for Mon-Sun (7 days)
    days = []
    for i in range(7):
        day_date = week_start + timedelta(days=i)
        # Only mark days that have passed or are today
        if day_date <= today:
            days.append(day_date in activity_dates)
        else:
            days.append(False)  # Future days
    
    # Calculate current streak (consecutive days ending today or yesterday)
    current_streak = 0
    check_date = today
    while True:
        if UserActivity.objects.filter(user=user, date=check_date).exists():
            current_streak += 1
            check_date -= timedelta(days=1)
        else:
            break
    
    return Response({
        'days': days,
        'current_streak': current_streak,
        'week_start': week_start.isoformat(),
    })


@extend_schema(
    responses=inline_serializer(
        name='CommunityPulseResponse',
        fields={
            'pulse': serializers.IntegerField(),
            'posts_count': serializers.IntegerField(),
            'comments_count': serializers.IntegerField(),
            'active_users': serializers.IntegerField(),
        },
    )
)
@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def community_pulse_view(request):
    """
    Get real-time community activity metrics.
    Calculates a "pulse" percentage based on activity in the last hour.
    """
    from blog.models import Post, Comment
    
    now = timezone.now()
    one_hour_ago = now - timedelta(hours=1)
    
    # Count activity in the last hour
    posts_count = Post.objects.filter(date_posted__gte=one_hour_ago).count()
    comments_count = Comment.objects.filter(created_at__gte=one_hour_ago).count()
    
    # Count likes in the last hour (harder since likes don't have timestamps)
    # We'll use a different approach: count total active users in last 5 mins
    five_mins_ago = now - timedelta(minutes=5)
    from users.models import Profile
    active_users = Profile.objects.filter(last_seen__gte=five_mins_ago).count()
    
    # Calculate pulse as a weighted score (0-100)
    # More weight to active users since that's real-time engagement
    raw_score = (posts_count * 15) + (comments_count * 5) + (active_users * 10)
    
    # Normalize to 0-100 range (cap at 100)
    # Baseline: 20 (minimum pulse when site has any activity)
    # A typical "busy" score would be around 50-80
    pulse = min(100, max(20, 20 + raw_score))
    
    return Response({
        'pulse': pulse,
        'posts_count': posts_count,
        'comments_count': comments_count,
        'active_users': active_users,
    })


# ============ E2EE PUBLIC KEY API ============

@extend_schema(
    parameters=[OpenApiParameter(name='username', type=str, location=OpenApiParameter.PATH)],
    responses=inline_serializer(
        name='PublicKeyResponse',
        fields={
            'username': serializers.CharField(),
            'public_key': serializers.CharField(),
            'updated_at': serializers.CharField(),
        },
    )
)
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_public_key(request, username):
    """
    Fetch a user's public key for E2EE chat.
    
    SECURITY NOTES:
    - Returns the X25519 public key for the specified user
    - Used by clients to derive shared secrets for encryption
    - Trust-on-first-use model (no key verification UI)
    """
    try:
        user = User.objects.get(username=username)
        public_key = UserPublicKey.objects.get(user=user)
        return Response({
            'username': username,
            'public_key': public_key.key_data,
            'updated_at': public_key.updated_at.isoformat()
        })
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    except UserPublicKey.DoesNotExist:
        return Response({'error': 'Public key not found'}, status=status.HTTP_404_NOT_FOUND)


@extend_schema(
    request=inline_serializer(
        name='SetPublicKeyRequest',
        fields={'public_key': serializers.CharField()},
    ),
    responses=inline_serializer(
        name='SetPublicKeyResponse',
        fields={'status': serializers.CharField(), 'username': serializers.CharField()},
    ),
)
@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def set_public_key(request):
    """
    Set or update the current user's public key.
    
    SECURITY NOTES:
    - Only accepts Base64-encoded X25519 public keys
    - Key is validated for length (should be 32 bytes = ~44 chars base64)
    - Overwrites any existing key (no key history)
    """
    key_data = request.data.get('public_key')
    
    if not key_data:
        return Response({'error': 'public_key is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Basic validation: X25519 public key should be ~44 chars in base64
    if not isinstance(key_data, str) or len(key_data) < 40 or len(key_data) > 100:
        return Response({'error': 'Invalid public key format'}, status=status.HTTP_400_BAD_REQUEST)
    
    UserPublicKey.objects.update_or_create(
        user=request.user,
        defaults={'key_data': key_data}
    )
    
    return Response({'status': 'ok', 'username': request.user.username})


@extend_schema(
    responses=inline_serializer(
        name='MyPublicKeyResponse',
        fields={
            'username': serializers.CharField(),
            'public_key': serializers.CharField(),
            'updated_at': serializers.CharField(),
        },
    )
)
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_my_public_key(request):
    """
    Get the current user's own public key.
    Useful for checking if a key has been set.
    """
    try:
        public_key = UserPublicKey.objects.get(user=request.user)
        return Response({
            'username': request.user.username,
            'public_key': public_key.key_data,
            'updated_at': public_key.updated_at.isoformat()
        })
    except UserPublicKey.DoesNotExist:
        return Response({'error': 'No public key set'}, status=status.HTTP_404_NOT_FOUND)


# ============ ACHIEVEMENTS API ============

from users.models import UserAchievement


def check_and_award_achievements(user):
    """
    Check and award any achievements the user has earned but not yet received.
    This is called when fetching achievements to ensure real-time updates.
    """
    from blog.models import Post, Community
    
    earned = set(UserAchievement.objects.filter(user=user).values_list('achievement_id', flat=True))
    new_achievements = []
    
    # First Post (1 post)
    if 'first_post' not in earned:
        if Post.objects.filter(author=user).exists():
            UserAchievement.objects.create(user=user, achievement_id='first_post')
            new_achievements.append('first_post')
    
    # Rising Star (10 posts)
    if 'rising_star' not in earned:
        if Post.objects.filter(author=user).count() >= 10:
            UserAchievement.objects.create(user=user, achievement_id='rising_star')
            new_achievements.append('rising_star')
    
    # Karma King (100 karma)
    if 'karma_king' not in earned:
        user_posts = Post.objects.filter(author=user)
        total_likes = sum(post.total_likes for post in user_posts)
        total_dislikes = sum(post.total_dislikes for post in user_posts)
        karma = total_likes - total_dislikes
        if karma >= 100:
            UserAchievement.objects.create(user=user, achievement_id='karma_king')
            new_achievements.append('karma_king')
    
    # Week Warrior (7-day streak)
    if 'week_warrior' not in earned:
        from users.models import UserActivity
        from datetime import timedelta
        today = timezone.now().date()
        streak = 0
        check_date = today
        while UserActivity.objects.filter(user=user, date=check_date).exists():
            streak += 1
            check_date -= timedelta(days=1)
        if streak >= 7:
            UserAchievement.objects.create(user=user, achievement_id='week_warrior')
            new_achievements.append('week_warrior')
    
    # Community Builder (5 communities)
    if 'community_builder' not in earned:
        joined_count = Community.objects.filter(members=user).count()
        if joined_count >= 5:
            UserAchievement.objects.create(user=user, achievement_id='community_builder')
            new_achievements.append('community_builder')
    
    # Social Butterfly (50 followers)
    if 'social_butterfly' not in earned:
        if user.followers.count() >= 50:
            UserAchievement.objects.create(user=user, achievement_id='social_butterfly')
            new_achievements.append('social_butterfly')
    
    return new_achievements


@extend_schema(
    responses=inline_serializer(
        name='PendingAchievementsResponse',
        fields={
            'pending': serializers.ListField(
                child=inline_serializer(
                    name='PendingAchievement',
                    fields={
                        'id': serializers.CharField(),
                        'earned_at': serializers.CharField(),
                    },
                )
            )
        },
    )
)
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def pending_achievements_view(request):
    """
    Get pending achievements that haven't been shown to the user yet.
    Also checks and awards any new achievements the user has earned.
    """
    user = request.user
    
    # Check for new achievements
    check_and_award_achievements(user)
    
    # Get achievements not yet shown
    pending = UserAchievement.objects.filter(user=user, shown_to_user=False)
    
    achievements = []
    for achievement in pending:
        achievements.append({
            'id': achievement.achievement_id,
            'earned_at': achievement.earned_at.isoformat()
        })
    
    return Response({'pending': achievements})


@extend_schema(
    request=inline_serializer(
        name='MarkAchievementShownRequest',
        fields={'achievement_id': serializers.CharField()},
    ),
    responses=inline_serializer(
        name='MarkAchievementShownResponse',
        fields={'detail': serializers.CharField()},
    )
)
@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def mark_achievement_shown_view(request):
    """
    Mark an achievement as shown to the user.
    """
    achievement_id = request.data.get('achievement_id')
    if not achievement_id:
        return Response({'error': 'achievement_id is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        achievement = UserAchievement.objects.get(user=request.user, achievement_id=achievement_id)
        achievement.shown_to_user = True
        achievement.save(update_fields=['shown_to_user'])
        return Response({'detail': 'Achievement marked as shown'})
    except UserAchievement.DoesNotExist:
        return Response({'error': 'Achievement not found'}, status=status.HTTP_404_NOT_FOUND)


@extend_schema(
    responses=inline_serializer(
        name='AllAchievementsResponse',
        fields={
            'achievements': serializers.ListField(
                child=inline_serializer(
                    name='Achievement',
                    fields={
                        'id': serializers.CharField(),
                        'earned_at': serializers.CharField(),
                    },
                )
            )
        },
    )
)
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def all_achievements_view(request):
    """
    Get all achievements the user has earned (for profile display).
    """
    achievements = UserAchievement.objects.filter(user=request.user)
    
    data = []
    for achievement in achievements:
        data.append({
            'id': achievement.achievement_id,
            'earned_at': achievement.earned_at.isoformat()
        })
    
    return Response({'achievements': data})


# ============ NOTIFICATIONS API ============

from users.models import Notification


def _serialize_notification(n):
    """Serialize a Notification instance to a dict."""
    return {
        'id': n.id,
        'type': n.notification_type,
        'actor': {
            'id': n.actor.id,
            'username': n.actor.username,
            'profile_image': n.actor.profile.image.url if n.actor.profile.image else None,
        },
        'post_slug': n.post_slug or None,
        'post_title': n.post_title or None,
        'comment_id': n.comment_id,
        'community_slug': n.community_slug or None,
        'is_read': n.is_read,
        'created_at': n.created_at.isoformat(),
    }


def create_notification(recipient, actor, notification_type, post_slug='', post_title='', comment_id=None, community_slug=''):
    """
    Create a notification and broadcast it via WebSocket.
    Does nothing if actor == recipient (no self-notifications).
    """
    if recipient.id == actor.id:
        return None

    notification = Notification.objects.create(
        recipient=recipient,
        actor=actor,
        notification_type=notification_type,
        post_slug=post_slug,
        post_title=post_title,
        comment_id=comment_id,
        community_slug=community_slug,
    )

    # Broadcast via channel layer (fire-and-forget from sync context)
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f'notifications_{recipient.id}',
                {
                    'type': 'send_notification',
                    'notification': _serialize_notification(notification),
                }
            )
    except Exception:
        pass  # WebSocket delivery is best-effort

    return notification


@extend_schema(
    responses=inline_serializer(
        name='NotificationsListResponse',
        fields={
            'notifications': serializers.ListField(),
            'unread_count': serializers.IntegerField(),
        },
    )
)
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def notifications_list_view(request):
    """Get the current user's notifications (latest 50)."""
    notifications = (
        Notification.objects
        .filter(recipient=request.user)
        .select_related('actor', 'actor__profile')
        [:50]
    )
    unread_count = Notification.objects.filter(recipient=request.user, is_read=False).count()
    return Response({
        'notifications': [_serialize_notification(n) for n in notifications],
        'unread_count': unread_count,
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def notifications_unread_count_view(request):
    """Get unread notification count."""
    count = Notification.objects.filter(recipient=request.user, is_read=False).count()
    return Response({'unread_count': count})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def notifications_mark_read_view(request):
    """Mark notifications as read. Pass notification_ids or omit to mark all."""
    ids = request.data.get('notification_ids')
    qs = Notification.objects.filter(recipient=request.user, is_read=False)
    if ids:
        qs = qs.filter(id__in=ids)
    updated = qs.update(is_read=True)
    return Response({'marked_read': updated})


# ============ EMAIL VERIFICATION & PASSWORD RESET ============

from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_decode
from django.utils.encoding import force_str
from users.tokens import verify_email_token
from users.emails import send_verification_email, send_password_reset_email


@extend_schema(
    request=inline_serializer(
        name='VerifyEmailRequest',
        fields={'token': serializers.CharField()},
    ),
)
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def verify_email_view(request):
    """Verify a user's email address using a signed token."""
    token = request.data.get('token')
    if not token:
        return Response({'detail': 'Token is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user_pk, email = verify_email_token(token)
    except Exception:
        return Response({'detail': 'Invalid or expired verification link.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(pk=user_pk)
    except User.DoesNotExist:
        return Response({'detail': 'Invalid verification link.'}, status=status.HTTP_400_BAD_REQUEST)

    if user.email != email:
        return Response({'detail': 'This verification link is no longer valid.'}, status=status.HTTP_400_BAD_REQUEST)

    if user.profile.email_verified:
        return Response({'detail': 'Email is already verified.'})

    user.profile.email_verified = True
    user.profile.save(update_fields=['email_verified'])
    logger.info('Email verified for user=%s', user.username)
    return Response({'detail': 'Email verified successfully.'})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def resend_verification_view(request):
    """Resend the email verification link."""
    request.throttle_scope = 'register'
    if request.user.profile.email_verified:
        return Response({'detail': 'Email is already verified.'})
    try:
        send_verification_email(request.user)
    except Exception:
        logger.exception('Failed to resend verification email for user=%s', request.user.username)
        return Response({'detail': 'Failed to send email. Please try again later.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    return Response({'detail': 'Verification email sent.'})


@extend_schema(
    request=inline_serializer(
        name='PasswordResetRequest',
        fields={'email': serializers.EmailField()},
    ),
)
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
@throttle_classes([ScopedRateThrottle])
def password_reset_request_view(request):
    """Request a password reset email."""
    request.throttle_scope = 'password_change'
    email = request.data.get('email', '').strip().lower()
    if not email:
        return Response({'detail': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    # Always return 200 regardless of whether user exists (prevent email enumeration)
    try:
        user = User.objects.get(email__iexact=email)
        send_password_reset_email(user)
    except User.DoesNotExist:
        pass
    except Exception:
        logger.exception('Failed to send password reset email for email=%s', email)

    return Response({'detail': 'If an account with that email exists, a reset link has been sent.'})


@extend_schema(
    request=inline_serializer(
        name='PasswordResetConfirmRequest',
        fields={
            'uid': serializers.CharField(),
            'token': serializers.CharField(),
            'new_password': serializers.CharField(),
        },
    ),
)
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def password_reset_confirm_view(request):
    """Reset password using uid and token from the reset email."""
    uid = request.data.get('uid')
    token = request.data.get('token')
    new_password = request.data.get('new_password')

    if not uid or not token or not new_password:
        return Response({'detail': 'uid, token, and new_password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user_pk = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=user_pk)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return Response({'detail': 'Invalid reset link.'}, status=status.HTTP_400_BAD_REQUEST)

    if not default_token_generator.check_token(user, token):
        return Response({'detail': 'Reset link has expired or is invalid.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(new_password, user=user)
    except Exception as e:
        return Response({'detail': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save()
    logger.info('Password reset completed for user=%s', user.username)
    return Response({'detail': 'Password has been reset successfully. You can now log in.'})


# ============ USER SETTINGS ============

class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = [
            'notify_likes', 'notify_comments', 'notify_follows', 'notify_replies',
            'email_notifications', 'profile_visibility', 'show_online_status',
            'who_can_message',
        ]


@api_view(['GET', 'PATCH'])
@permission_classes([permissions.IsAuthenticated])
def user_settings_view(request):
    """Get or update the current user's notification and privacy settings."""
    settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)

    if request.method == 'GET':
        serializer = UserSettingsSerializer(settings_obj)
        return Response(serializer.data)

    serializer = UserSettingsSerializer(settings_obj, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def delete_account_view(request):
    """Permanently delete the current user's account."""
    password = request.data.get('password')
    if not password:
        return Response(
            {'detail': 'Password is required to confirm account deletion.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not request.user.check_password(password):
        return Response(
            {'detail': 'Incorrect password.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    username = request.user.username
    logout(request)
    request.user.delete()
    logger.info('Account deleted: username=%s', username)
    return Response({'detail': 'Account deleted successfully.'})


# ============ SPHERES / LIVEKIT ============

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sphere_join_view(request, slug):
    """
    Join a Sphere audio room. Returns a LiveKit access token.
    Requires an active room to exist (created via sphere_create_view).
    """
    from blog.models import Community, CommunityMembership, SphereRoom, SphereParticipant
    from django.conf import settings as django_settings

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    # Must be a community member
    membership = CommunityMembership.objects.filter(
        user=request.user, community=community
    ).first()

    if not membership:
        return Response(
            {'error': 'You must be a member to join this sphere'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Map community role → sphere role
    is_privileged = membership.role in ('admin', 'moderator')
    sphere_role = 'conductor' if is_privileged else 'listener'

    # Room must already exist
    room = SphereRoom.objects.filter(community=community, state='live').first()
    if not room:
        return Response(
            {'error': 'No active Sphere. A conductor must start one first.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Check if room is locked
    if room.is_locked and not is_privileged:
        return Response(
            {'error': 'This sphere is currently locked'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Create or update SphereParticipant
    participant, created = SphereParticipant.objects.update_or_create(
        room=room, user=request.user,
        defaults={'role': sphere_role, 'left_at': None, 'hand_raised_at': None},
    )

    # Update participant count
    active_count = SphereParticipant.objects.filter(room=room, left_at__isnull=True).count()
    room.participant_count = active_count
    room.save(update_fields=['participant_count'])

    # Generate LiveKit JWT
    from livekit.api import AccessToken, VideoGrants

    room_name = f'sphere_{slug}'

    profile_image = None
    if hasattr(request.user, 'profile') and request.user.profile.image:
        profile_image = request.build_absolute_uri(request.user.profile.image.url)

    metadata = str({
        'username': request.user.username,
        'profile_image': profile_image,
        'community_role': membership.role,
    })

    grant = VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=sphere_role in ('conductor', 'speaker'),
        can_subscribe=True,
    )

    token = (
        AccessToken(
            api_key=django_settings.LIVEKIT_API_KEY,
            api_secret=django_settings.LIVEKIT_API_SECRET,
        )
        .with_identity(str(request.user.id))
        .with_name(request.user.username)
        .with_metadata(metadata)
        .with_grants(grant)
    )

    return Response({
        'token': token.to_jwt(),
        'livekit_url': django_settings.LIVEKIT_URL,
        'room_name': room_name,
        'role': sphere_role,
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sphere_leave_view(request, slug):
    """Leave a Sphere audio room."""
    from blog.models import Community, SphereRoom, SphereParticipant

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    room = SphereRoom.objects.filter(community=community, state='live').first()
    if not room:
        return Response({'detail': 'No active sphere'})

    participant = SphereParticipant.objects.filter(room=room, user=request.user, left_at__isnull=True).first()
    if participant:
        participant.left_at = timezone.now()
        participant.save(update_fields=['left_at'])

    # Update count
    active_count = SphereParticipant.objects.filter(room=room, left_at__isnull=True).count()
    room.participant_count = active_count
    room.save(update_fields=['participant_count'])

    # Auto-end empty room
    if active_count == 0:
        room.end()

    return Response({'detail': 'Left sphere'})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sphere_end_view(request, slug):
    """End a Sphere audio room. Only the conductor (admin/mod) can do this."""
    from blog.models import Community, CommunityMembership, SphereRoom, SphereParticipant

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    # Only admin/mod can force-end
    membership = CommunityMembership.objects.filter(
        user=request.user, community=community, role__in=('admin', 'moderator')
    ).first()
    if not membership:
        return Response({'error': 'Only admins and moderators can end a sphere'}, status=status.HTTP_403_FORBIDDEN)

    room = SphereRoom.objects.filter(community=community, state='live').first()
    if not room:
        return Response({'error': 'No active sphere'}, status=status.HTTP_404_NOT_FOUND)

    # Mark all active participants as left
    SphereParticipant.objects.filter(room=room, left_at__isnull=True).update(left_at=timezone.now())

    # End the room
    room.end()

    return Response({'detail': 'Sphere ended'})


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def sphere_participants_view(request, slug):
    """List active participants in a Sphere."""
    from blog.models import Community, SphereRoom, SphereParticipant

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    room = SphereRoom.objects.filter(community=community, state='live').first()
    if not room:
        return Response({'participants': []})

    participants = SphereParticipant.objects.filter(
        room=room, left_at__isnull=True
    ).select_related('user', 'user__profile')

    data = []
    for p in participants:
        profile_img = None
        if hasattr(p.user, 'profile') and p.user.profile.image:
            profile_img = request.build_absolute_uri(p.user.profile.image.url)
        data.append({
            'user_id': p.user.id,
            'username': p.user.username,
            'profile_image': profile_img,
            'role': p.role,
            'is_muted': p.is_muted,
            'hand_raised': p.hand_raised_at is not None,
        })

    return Response({'participants': data})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sphere_hand_raise_view(request, slug):
    """Toggle hand raise in a Sphere."""
    from blog.models import Community, SphereRoom, SphereParticipant

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    room = SphereRoom.objects.filter(community=community, state='live').first()
    if not room:
        return Response({'error': 'No active sphere'}, status=status.HTTP_404_NOT_FOUND)

    participant = SphereParticipant.objects.filter(
        room=room, user=request.user, left_at__isnull=True
    ).first()
    if not participant:
        return Response({'error': 'Not in this sphere'}, status=status.HTTP_400_BAD_REQUEST)

    # Toggle
    if participant.hand_raised_at:
        participant.hand_raised_at = None
    else:
        participant.hand_raised_at = timezone.now()
    participant.save(update_fields=['hand_raised_at'])

    # Broadcast via Channels
    raised = participant.hand_raised_at is not None
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f'sphere_{slug}',
                {
                    'type': 'hand_raise',
                    'user_id': request.user.id,
                    'username': request.user.username,
                    'raised': raised,
                }
            )
    except Exception:
        pass

    return Response({'raised': raised})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sphere_promote_view(request, slug):
    """Host promotes a listener to speaker."""
    from blog.models import Community, CommunityMembership, SphereRoom, SphereParticipant
    from django.conf import settings as django_settings

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    # Check caller is host
    caller_membership = CommunityMembership.objects.filter(
        user=request.user, community=community, role__in=('admin', 'moderator')
    ).first()
    if not caller_membership:
        return Response({'error': 'Only hosts can promote'}, status=status.HTTP_403_FORBIDDEN)

    target_user_id = request.data.get('user_id')
    if not target_user_id:
        return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    room = SphereRoom.objects.filter(community=community, state='live').first()
    if not room:
        return Response({'error': 'No active sphere'}, status=status.HTTP_404_NOT_FOUND)

    participant = SphereParticipant.objects.filter(
        room=room, user_id=target_user_id, left_at__isnull=True
    ).first()
    if not participant:
        return Response({'error': 'User not in sphere'}, status=status.HTTP_400_BAD_REQUEST)

    participant.role = 'speaker'
    participant.hand_raised_at = None
    participant.save(update_fields=['role', 'hand_raised_at'])

    # Update LiveKit permissions to allow publishing
    try:
        from livekit.api import LiveKitAPI
        from livekit.protocol.room import UpdateParticipantRequest
        from livekit.protocol.models import ParticipantPermission
        import asyncio
        
        async def update_permissions():
            api = LiveKitAPI(
                url=django_settings.LIVEKIT_URL.replace('ws://', 'http://').replace('wss://', 'https://'),
                api_key=django_settings.LIVEKIT_API_KEY,
                api_secret=django_settings.LIVEKIT_API_SECRET,
            )
            try:
                req = UpdateParticipantRequest(
                    room=f'sphere_{slug}',
                    identity=str(target_user_id),
                    permission=ParticipantPermission(can_publish=True, can_subscribe=True)
                )
                await api.room.update_participant(req)
            finally:
                await api.aclose()
        
        asyncio.run(update_permissions())
    except Exception as e:
        print(f"LiveKit permission error: {e}")

    # Broadcast role change
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f'sphere_{slug}',
                {
                    'type': 'role_change',
                    'user_id': int(target_user_id),
                    'new_role': 'speaker',
                }
            )
    except Exception:
        pass

    return Response({'detail': 'User promoted to speaker'})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sphere_demote_view(request, slug):
    """Host demotes a speaker to listener."""
    from blog.models import Community, CommunityMembership, SphereRoom, SphereParticipant
    from django.conf import settings as django_settings

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    caller_membership = CommunityMembership.objects.filter(
        user=request.user, community=community, role__in=('admin', 'moderator')
    ).first()
    if not caller_membership:
        return Response({'error': 'Only hosts can demote'}, status=status.HTTP_403_FORBIDDEN)

    target_user_id = request.data.get('user_id')
    if not target_user_id:
        return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    room = SphereRoom.objects.filter(community=community, state='live').first()
    if not room:
        return Response({'error': 'No active sphere'}, status=status.HTTP_404_NOT_FOUND)

    participant = SphereParticipant.objects.filter(
        room=room, user_id=target_user_id, left_at__isnull=True
    ).first()
    if not participant:
        return Response({'error': 'User not in sphere'}, status=status.HTTP_400_BAD_REQUEST)

    participant.role = 'listener'
    participant.save(update_fields=['role'])

    # Revoke LiveKit publish permission
    try:
        from livekit.api import LiveKitAPI
        from livekit.protocol.room import UpdateParticipantRequest
        from livekit.protocol.models import ParticipantPermission
        import asyncio
        
        async def revoke_permissions():
            api = LiveKitAPI(
                url=django_settings.LIVEKIT_URL.replace('ws://', 'http://').replace('wss://', 'https://'),
                api_key=django_settings.LIVEKIT_API_KEY,
                api_secret=django_settings.LIVEKIT_API_SECRET,
            )
            try:
                req = UpdateParticipantRequest(
                    room=f'sphere_{slug}',
                    identity=str(target_user_id),
                    permission=ParticipantPermission(can_publish=False, can_subscribe=True)
                )
                await api.room.update_participant(req)
            finally:
                await api.aclose()
                
        asyncio.run(revoke_permissions())
    except Exception as e:
        print(f"LiveKit permission error: {e}")

    # Broadcast role change
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f'sphere_{slug}',
                {
                    'type': 'role_change',
                    'user_id': int(target_user_id),
                    'new_role': 'listener',
                }
            )
    except Exception:
        pass

    return Response({'detail': 'User demoted to listener'})


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def sphere_status_view(request, slug):
    """Return current sphere status for a community (used by CommunityPage smart button)."""
    from blog.models import Community, SphereRoom, SphereParticipant

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    room = SphereRoom.objects.filter(community=community, state='live').first()

    if not room:
        return Response({
            'is_live': False,
            'participant_count': 0,
            'title': None,
            'conductor': None,
            'room_id': None,
        })

    conductor_participant = SphereParticipant.objects.filter(
        room=room, role='conductor', left_at__isnull=True
    ).select_related('user', 'user__profile').first()

    conductor_data = None
    if conductor_participant:
        profile_img = None
        if hasattr(conductor_participant.user, 'profile') and conductor_participant.user.profile.image:
            profile_img = request.build_absolute_uri(conductor_participant.user.profile.image.url)
        conductor_data = {
            'user_id': conductor_participant.user.id,
            'username': conductor_participant.user.username,
            'profile_image': profile_img,
        }

    return Response({
        'is_live': True,
        'participant_count': room.participant_count,
        'title': room.title or community.name,
        'conductor': conductor_data,
        'room_id': str(room.id),
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sphere_create_view(request, slug):
    """Create a new Sphere audio room. Only admins/moderators can create."""
    from blog.models import Community, CommunityMembership, SphereRoom, SphereParticipant

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    membership = CommunityMembership.objects.filter(
        user=request.user, community=community, role__in=('admin', 'moderator')
    ).first()
    if not membership:
        return Response(
            {'error': 'Only admins and moderators can start a Sphere'},
            status=status.HTTP_403_FORBIDDEN,
        )

    existing = SphereRoom.objects.filter(community=community, state='live').first()
    if existing:
        return Response(
            {'error': 'A Sphere is already live in this community'},
            status=status.HTTP_409_CONFLICT,
        )

    title = request.data.get('title', '').strip() or community.name
    room = SphereRoom.objects.create(
        community=community,
        title=title,
        creator=request.user,
        state='live',
    )

    SphereParticipant.objects.create(
        room=room,
        user=request.user,
        role='conductor',
        is_muted=True,
    )
    room.participant_count = 1
    room.save(update_fields=['participant_count'])

    # Notify all community members (excluding creator)
    from django.contrib.auth.models import User as AuthUser
    member_ids = list(
        CommunityMembership.objects.filter(community=community)
        .exclude(user=request.user)
        .values_list('user_id', flat=True)
    )

    if member_ids:
        notifications = [
            Notification(
                recipient_id=uid,
                actor=request.user,
                notification_type='sphere',
                post_title=community.name,
                community_slug=community.slug,
            )
            for uid in member_ids
        ]
        Notification.objects.bulk_create(notifications)

        # Broadcast via WebSocket
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            if channel_layer:
                created_notifications = Notification.objects.filter(
                    actor=request.user,
                    notification_type='sphere',
                    community_slug=community.slug,
                ).select_related('actor', 'actor__profile').order_by('-created_at')[:len(member_ids)]
                for n in created_notifications:
                    async_to_sync(channel_layer.group_send)(
                        f'notifications_{n.recipient_id}',
                        {
                            'type': 'send_notification',
                            'notification': _serialize_notification(n),
                        }
                    )
        except Exception:
            pass

    return Response({
        'room_id': str(room.id),
        'title': room.title,
        'state': room.state,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sphere_request_join_view(request, slug):
    """Non-member requests to join a live Sphere."""
    from blog.models import Community, CommunityMembership, SphereRoom, SphereJoinRequest

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    is_member = CommunityMembership.objects.filter(user=request.user, community=community).exists()
    if is_member:
        return Response({'error': 'You are already a member. Use join instead.'}, status=status.HTTP_400_BAD_REQUEST)

    room = SphereRoom.objects.filter(community=community, state='live').first()
    if not room:
        return Response({'error': 'No active Sphere'}, status=status.HTTP_404_NOT_FOUND)

    join_request, created = SphereJoinRequest.objects.get_or_create(
        room=room, user=request.user,
        defaults={'status': 'pending'}
    )

    if not created and join_request.status == 'denied':
        return Response({'error': 'Your request was denied'}, status=status.HTTP_403_FORBIDDEN)

    return Response({
        'status': join_request.status,
        'created': created,
    }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def sphere_pending_requests_view(request, slug):
    """Get pending join requests (for conductor)."""
    from blog.models import Community, CommunityMembership, SphereRoom, SphereJoinRequest

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    if not CommunityMembership.objects.filter(
        user=request.user, community=community, role__in=('admin', 'moderator')
    ).exists():
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    room = SphereRoom.objects.filter(community=community, state='live').first()
    if not room:
        return Response({'requests': []})

    requests_qs = SphereJoinRequest.objects.filter(
        room=room, status='pending'
    ).select_related('user', 'user__profile')

    data = []
    for jr in requests_qs:
        profile_img = None
        if hasattr(jr.user, 'profile') and jr.user.profile.image:
            profile_img = request.build_absolute_uri(jr.user.profile.image.url)
        data.append({
            'id': jr.id,
            'user_id': jr.user.id,
            'username': jr.user.username,
            'profile_image': profile_img,
            'created_at': jr.created_at.isoformat(),
        })

    return Response({'requests': data})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sphere_approve_request_view(request, slug):
    """Conductor approves a join request."""
    from blog.models import Community, CommunityMembership, SphereRoom, SphereJoinRequest

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    if not CommunityMembership.objects.filter(
        user=request.user, community=community, role__in=('admin', 'moderator')
    ).exists():
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    request_id = request.data.get('request_id')
    if not request_id:
        return Response({'error': 'request_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    room = SphereRoom.objects.filter(community=community, state='live').first()
    if not room:
        return Response({'error': 'No active Sphere'}, status=status.HTTP_404_NOT_FOUND)

    try:
        jr = SphereJoinRequest.objects.get(id=request_id, room=room, status='pending')
    except SphereJoinRequest.DoesNotExist:
        return Response({'error': 'Request not found or already reviewed'}, status=status.HTTP_404_NOT_FOUND)

    jr.status = 'approved'
    jr.reviewed_at = timezone.now()
    jr.reviewed_by = request.user
    jr.save(update_fields=['status', 'reviewed_at', 'reviewed_by'])

    # Auto-add as community member so they can join the sphere
    CommunityMembership.objects.get_or_create(
        user=jr.user, community=community,
        defaults={'role': 'member'}
    )

    return Response({'detail': 'Request approved'})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sphere_deny_request_view(request, slug):
    """Conductor denies a join request."""
    from blog.models import Community, CommunityMembership, SphereRoom, SphereJoinRequest

    try:
        community = Community.objects.get(slug=slug)
    except Community.DoesNotExist:
        return Response({'error': 'Community not found'}, status=status.HTTP_404_NOT_FOUND)

    if not CommunityMembership.objects.filter(
        user=request.user, community=community, role__in=('admin', 'moderator')
    ).exists():
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    request_id = request.data.get('request_id')
    if not request_id:
        return Response({'error': 'request_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    room = SphereRoom.objects.filter(community=community, state='live').first()
    if not room:
        return Response({'error': 'No active Sphere'}, status=status.HTTP_404_NOT_FOUND)

    try:
        jr = SphereJoinRequest.objects.get(id=request_id, room=room, status='pending')
    except SphereJoinRequest.DoesNotExist:
        return Response({'error': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

    jr.status = 'denied'
    jr.reviewed_at = timezone.now()
    jr.reviewed_by = request.user
    jr.save(update_fields=['status', 'reviewed_at', 'reviewed_by'])

    return Response({'detail': 'Request denied'})


# ============ BLOCK / MUTE / REPORT API ============

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def block_user_view(request, username):
    """Block a user. The blocked user cannot see your content or interact with you."""
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    if target == request.user:
        return Response({'error': 'Cannot block yourself'}, status=status.HTTP_400_BAD_REQUEST)

    _, created = Block.objects.get_or_create(blocker=request.user, blocked=target)
    # Also unfollow in both directions
    Follow.objects.filter(follower=request.user, following=target).delete()
    Follow.objects.filter(follower=target, following=request.user).delete()

    return Response({'detail': 'User blocked' if created else 'Already blocked'})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def unblock_user_view(request, username):
    """Unblock a previously blocked user."""
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    deleted, _ = Block.objects.filter(blocker=request.user, blocked=target).delete()
    if deleted:
        return Response({'detail': 'User unblocked'})
    return Response({'error': 'User was not blocked'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def mute_user_view(request, username):
    """Mute a user. Their content will be hidden from your feeds."""
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    if target == request.user:
        return Response({'error': 'Cannot mute yourself'}, status=status.HTTP_400_BAD_REQUEST)

    _, created = Mute.objects.get_or_create(muter=request.user, muted=target)
    return Response({'detail': 'User muted' if created else 'Already muted'})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def unmute_user_view(request, username):
    """Unmute a previously muted user."""
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    deleted, _ = Mute.objects.filter(muter=request.user, muted=target).delete()
    if deleted:
        return Response({'detail': 'User unmuted'})
    return Response({'error': 'User was not muted'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def blocked_users_view(request):
    """Return the list of users the current user has blocked."""
    blocks = Block.objects.filter(blocker=request.user).select_related('blocked__profile')
    users = []
    for b in blocks:
        users.append({
            'id': b.blocked.id,
            'username': b.blocked.username,
            'profile_image': b.blocked.profile.image.url if hasattr(b.blocked, 'profile') and b.blocked.profile.image else None,
            'blocked_at': b.created_at,
        })
    return Response(users)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def muted_users_view(request):
    """Return the list of users the current user has muted."""
    mutes = Mute.objects.filter(muter=request.user).select_related('muted__profile')
    users = []
    for m in mutes:
        users.append({
            'id': m.muted.id,
            'username': m.muted.username,
            'profile_image': m.muted.profile.image.url if hasattr(m.muted, 'profile') and m.muted.profile.image else None,
            'muted_at': m.created_at,
        })
    return Response(users)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def report_content_view(request):
    """Report a user, post, or comment for moderation."""
    content_type = request.data.get('content_type')
    reason = request.data.get('reason')
    description = request.data.get('description', '')

    valid_types = ['user', 'post', 'comment']
    valid_reasons = [c[0] for c in Report.REASON_CHOICES]

    if content_type not in valid_types:
        return Response({'error': f'content_type must be one of: {valid_types}'}, status=status.HTTP_400_BAD_REQUEST)
    if reason not in valid_reasons:
        return Response({'error': f'reason must be one of: {valid_reasons}'}, status=status.HTTP_400_BAD_REQUEST)

    report_kwargs = {
        'reporter': request.user,
        'content_type': content_type,
        'reason': reason,
        'description': description[:2000],
    }

    if content_type == 'user':
        username = request.data.get('username')
        if not username:
            return Response({'error': 'username is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            target = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        if target == request.user:
            return Response({'error': 'Cannot report yourself'}, status=status.HTTP_400_BAD_REQUEST)
        report_kwargs['reported_user'] = target

    elif content_type == 'post':
        from blog.models import Post
        post_id = request.data.get('post_id')
        if not post_id:
            return Response({'error': 'post_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            post = Post.objects.get(id=post_id)
        except Post.DoesNotExist:
            return Response({'error': 'Post not found'}, status=status.HTTP_404_NOT_FOUND)
        report_kwargs['reported_post'] = post

    elif content_type == 'comment':
        from blog.models import Comment
        comment_id = request.data.get('comment_id')
        if not comment_id:
            return Response({'error': 'comment_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            comment = Comment.objects.get(id=comment_id)
        except Comment.DoesNotExist:
            return Response({'error': 'Comment not found'}, status=status.HTTP_404_NOT_FOUND)
        report_kwargs['reported_comment'] = comment

    report = Report.objects.create(**report_kwargs)

    # Send email notification to admin/moderator
    try:
        from django.core.mail import send_mail
        from django.conf import settings as app_settings
        notify_email = getattr(app_settings, 'REPORT_NOTIFY_EMAIL', None)
        if notify_email:
            target_info = {
                'user': f'User: @{report_kwargs.get("reported_user", "")}',
                'post': f'Post ID: {request.data.get("post_id", "")}',
                'comment': f'Comment ID: {request.data.get("comment_id", "")}',
            }.get(content_type, '')
            send_mail(
                subject=f'[Report] New {content_type} report: {reason}',
                message=(
                    f'New report submitted\n\n'
                    f'Type: {content_type}\n'
                    f'{target_info}\n'
                    f'Reason: {reason}\n'
                    f'Reporter: @{request.user.username}\n'
                    f'Description: {description or "(none)"}\n\n'
                    f'Review at: {request.build_absolute_uri("/admin/users/report/")}'
                ),
                from_email=None,  # uses DEFAULT_FROM_EMAIL
                recipient_list=[notify_email],
                fail_silently=True,
            )
    except Exception:
        pass  # don't fail the report if email fails

    return Response({'detail': 'Report submitted. Our team will review it.'}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def relationship_status_view(request, username):
    """Get the block/mute status between the current user and the given username."""
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response({
        'is_blocked': Block.objects.filter(blocker=request.user, blocked=target).exists(),
        'is_muted': Mute.objects.filter(muter=request.user, muted=target).exists(),
        'is_blocked_by': Block.objects.filter(blocker=target, blocked=request.user).exists(),
    })
