from django.db import models
from django.db.models import Count, F
from rest_framework import viewsets, permissions, decorators, status
from rest_framework.response import Response
from rest_framework import serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import api_view, permission_classes
from .models import Post, Comment, Livestream, LivestreamMessage, LivestreamSignal, Community, CommunityMembership
from django.contrib.auth.models import User
from django.utils import timezone
from django.utils.text import slugify
import math


class AuthorSerializer(serializers.ModelSerializer):
    profile_image = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "profile_image"]

    def get_profile_image(self, obj):
        profile = getattr(obj, "profile", None)
        image = getattr(profile, "image", None)
        if not image:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(image.url)
        return image.url


class CommunitySerializer(serializers.ModelSerializer):
    creator = AuthorSerializer(read_only=True)
    is_member = serializers.SerializerMethodField()
    posts_count = serializers.IntegerField(read_only=True)
    members_count = serializers.IntegerField(read_only=True)
    icon_url = serializers.SerializerMethodField()
    cover_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Community
        fields = [
            'id', 'name', 'slug', 'description', 'icon', 'cover_image',
            'icon_url', 'cover_image_url', 'creator', 'is_member',
            'posts_count', 'members_count', 'is_private', 'created_at'
        ]
        read_only_fields = ['id', 'slug', 'creator', 'posts_count', 'members_count', 'created_at']

    def get_is_member(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.members.filter(pk=request.user.pk).exists()

    def get_icon_url(self, obj):
        if not obj.icon: return None
        request = self.context.get('request')
        return request.build_absolute_uri(obj.icon.url) if request else obj.icon.url

    def get_cover_image_url(self, obj):
        if not obj.cover_image: return None
        request = self.context.get('request')
        return request.build_absolute_uri(obj.cover_image.url) if request else obj.cover_image.url

class PostCommunitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Community
        fields = ['name', 'slug']

class PostSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    likes_count = serializers.IntegerField(read_only=True)
    dislikes_count = serializers.IntegerField(read_only=True)
    comments_count = serializers.IntegerField(read_only=True)
    user_has_liked = serializers.SerializerMethodField()
    user_has_disliked = serializers.SerializerMethodField()
    # Read-only fields that return absolute URLs
    post_image_url = serializers.SerializerMethodField()
    post_video_url = serializers.SerializerMethodField()
    # Write-only fields for file uploads
    community = PostCommunitySerializer(read_only=True)
    community_slug = serializers.SlugRelatedField(
        slug_field='slug',
        queryset=Community.objects.all(),
        source='community',
        write_only=True,
        required=False,
        allow_null=True
    )

    class Meta:
        model = Post
        fields = [
            "id",
            "public_id",
            "slug",
            "title",
            "content",
            "post_image",
            "post_video",
            "post_image_url",
            "post_video_url",
            "date_posted",
            "author",
            "likes_count",
            "dislikes_count",
            "comments_count",
            "user_has_liked",
            "user_has_disliked",
            "views_count",
            "community",
            "community_slug",
        ]
        # Keep identifiers and derived URLs server-controlled to avoid collisions.
        read_only_fields = [
            "id",
            "public_id",
            "slug",
            "author",
            "likes_count",
            "dislikes_count",
            "comments_count",
            "user_has_liked",
            "user_has_disliked",
            "post_image_url",
            "post_video_url",
            "views_count",
            "community",
        ]

    def get_post_image_url(self, obj):
        if not obj.post_image:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.post_image.url)
        return obj.post_image.url

    def get_post_video_url(self, obj):
        if not obj.post_video:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.post_video.url)
        return obj.post_video.url

    def get_user_has_liked(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return obj.likes.filter(pk=user.pk).exists()

    def get_user_has_disliked(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return obj.dislikes.filter(pk=user.pk).exists()


class PostViewSet(viewsets.ModelViewSet):
    serializer_class = PostSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    lookup_field = "slug"
    # Use global DRF pagination defined in settings (PageNumberPagination, size 6).

    def get_queryset(self):
        queryset = (
            Post.objects.all()
            .select_related("author", "author__profile", "community")
            .prefetch_related("likes", "dislikes")
            .annotate(
                likes_count=Count("likes", distinct=True),
                dislikes_count=Count("dislikes", distinct=True),
                comments_count=Count("comments", distinct=True),
            )
            .order_by("-date_posted")
        )
        
        community_slug = self.request.query_params.get('community')
        if community_slug:
            queryset = queryset.filter(community__slug=community_slug)
            
        return queryset

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def get_object(self):
        lookup_value = self.kwargs.get(self.lookup_field)
        queryset = self.get_queryset()
        # Try slug
        obj = queryset.filter(slug=lookup_value).first()
        if obj:
            return obj
        # Try public_id
        try:
            obj = queryset.filter(public_id=lookup_value).first()
            if obj:
                return obj
        except Exception:
            pass
        # Fallback to numeric ID
        try:
            obj = queryset.filter(pk=int(lookup_value)).first()
            if obj:
                return obj
        except Exception:
            pass
        from django.http import Http404
        raise Http404("Post not found")

    def _annotated_instance(self, post):
        # Re-fetch the post with annotations so counts are accurate after mutations.
        return (
            self.get_queryset()
            .filter(pk=post.pk)
            .first()
        )

    @decorators.action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def like(self, request, slug=None):
        post = self.get_object()
        user = request.user
        if post.likes.filter(pk=user.pk).exists():
            post.likes.remove(user)
        else:
            post.dislikes.remove(user)
            post.likes.add(user)

        refreshed = self._annotated_instance(post)
        serializer = self.get_serializer(refreshed)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @decorators.action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def dislike(self, request, slug=None):
        post = self.get_object()
        user = request.user
        if post.dislikes.filter(pk=user.pk).exists():
            post.dislikes.remove(user)
        else:
            post.likes.remove(user)
            post.dislikes.add(user)

        refreshed = self._annotated_instance(post)
        serializer = self.get_serializer(refreshed)
        return Response(serializer.data, status=status.HTTP_200_OK)

class CommunityViewSet(viewsets.ModelViewSet):
    serializer_class = CommunitySerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    lookup_field = 'slug'

    def get_queryset(self):
        return Community.objects.all().annotate(
            posts_count=Count('posts', distinct=True),
            members_count=Count('members', distinct=True)
        )

    def perform_create(self, serializer):
        community = serializer.save(creator=self.request.user)
        # Creator is automatically a member (admin)
        CommunityMembership.objects.create(
            user=self.request.user,
            community=community,
            role='admin'
        )

    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def join(self, request, slug=None):
        community = self.get_object()
        membership, created = CommunityMembership.objects.get_or_create(
            user=request.user,
            community=community
        )
        return Response({'status': 'joined', 'role': membership.role})

    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def leave(self, request, slug=None):
        community = self.get_object()
        if community.creator == request.user:
            return Response({'error': 'Creator cannot leave the community'}, status=status.HTTP_400_BAD_REQUEST)
        
        CommunityMembership.objects.filter(user=request.user, community=community).delete()
        return Response({'status': 'left'})


# ==================== TRENDING ALGORITHM ====================

def wilson_score(ups: int, downs: int, confidence: float = 0.95) -> float:
    """
    Wilson Lower Bound Confidence Interval.
    Better than simple ratio - accounts for sample size.
    Used by Reddit for "Best" sorting.
    
    Returns a score between 0 and 1, where higher = more confident the item is liked.
    """
    n = ups + downs
    if n == 0:
        return 0
    
    # Z-score for 95% confidence (1.96)
    z = 1.96 if confidence == 0.95 else 1.645  # 90% fallback
    p = ups / n
    
    left = p + (z * z) / (2 * n)
    right = z * math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)
    under = 1 + (z * z) / n
    
    return (left - right) / under


def calculate_trending_score(post, now) -> float:
    """
    Combined trending score using:
    1. Wilson Lower Bound for confidence-based ranking
    2. Hacker News-style time decay (gravity)
    3. Engagement velocity (comments as proxy)
    4. Views boost (logarithmic)
    """
    ups = getattr(post, 'likes_count', 0) or 0
    downs = getattr(post, 'dislikes_count', 0) or 0
    comments = getattr(post, 'comments_count', 0) or 0
    views = post.views_count or 0
    
    # 1. Wilson Lower Bound for confidence
    wilson = wilson_score(ups, downs)
    
    # 2. Time decay (Hacker News style with gravity=1.5)
    age_hours = (now - post.date_posted).total_seconds() / 3600
    time_factor = 1 / pow(age_hours + 2, 1.5)
    
    # 3. Engagement velocity (comments per hour as proxy)
    velocity = (comments * 2) / max(age_hours, 1)
    
    # 4. Views boost (logarithmic to prevent domination)
    views_boost = math.log10(max(views, 1) + 1)
    
    # Combined weighted score
    # Wilson dominates (40%), time matters (30%), velocity (20%), views (10%)
    return (wilson * 40) + (time_factor * 30) + (velocity * 20) + (views_boost * 10)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def trending_posts_view(request):
    """
    Get posts ranked by trending score.
    Uses Wilson Lower Bound + Hacker News time decay + engagement velocity.
    
    Query params:
    - limit: max posts to return (default 20, max 50)
    """
    limit = min(int(request.query_params.get('limit', 20)), 50)
    now = timezone.now()
    
    # Limit candidates for scalability (recent and engaged posts)
    recent_window_days = int(request.query_params.get('window_days', 7))
    cutoff = now - timezone.timedelta(days=recent_window_days)

    posts = (
        Post.objects.filter(date_posted__gte=cutoff)
        .select_related('author', 'author__profile')
        .prefetch_related('likes', 'dislikes')
        .annotate(
            likes_count=Count('likes', distinct=True),
            dislikes_count=Count('dislikes', distinct=True),
            comments_count=Count('comments', distinct=True),
        )
        .order_by('-date_posted')
    )
    
    # Calculate trending scores and sort
    scored = [(p, calculate_trending_score(p, now)) for p in posts[:500]]
    scored.sort(key=lambda x: x[1], reverse=True)
    
    # Get top trending
    trending = [p for p, _ in scored[:limit]]
    
    serializer = PostSerializer(trending, many=True, context={'request': request})
    return Response({
        'results': serializer.data,
        'count': len(trending),
        'algorithm': 'wilson_hn_velocity'
    })


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def increment_post_views(request, slug):
    """
    Increment view count for a post.
    Called when a user views the post detail.
    """
    updated = Post.objects.filter(slug=slug).update(views_count=F('views_count') + 1)
    if updated:
        return Response({'status': 'ok'})
    return Response({'error': 'Post not found'}, status=status.HTTP_404_NOT_FOUND)

class CommentSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    likes_count = serializers.IntegerField(read_only=True)
    dislikes_count = serializers.IntegerField(read_only=True)
    replies_count = serializers.IntegerField(read_only=True)
    user_has_liked = serializers.SerializerMethodField()
    user_has_disliked = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id",
            "post",
            "parent",
            "content",
            "created_at",
            "updated_at",
            "author",
            "likes_count",
            "dislikes_count",
            "replies_count",
            "user_has_liked",
            "user_has_disliked",
            "replies",
        ]
        read_only_fields = ["author", "likes_count", "dislikes_count", "replies_count", "user_has_liked", "user_has_disliked"]

    def get_user_has_liked(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return obj.likes.filter(pk=user.pk).exists()

    def get_user_has_disliked(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return obj.dislikes.filter(pk=user.pk).exists()

    def get_replies(self, obj):
        # Only include replies for top-level comments (no parent)
        if obj.parent is not None:
            return []
        replies = (
            Comment.objects.filter(parent=obj)
            .select_related("author", "author__profile")
            .prefetch_related("likes", "dislikes")
            .annotate(
                likes_count=Count("likes", distinct=True),
                dislikes_count=Count("dislikes", distinct=True),
                replies_count=Count("replies", distinct=True),
            )
            .order_by("created_at")
        )
        return CommentSerializer(replies, many=True, context=self.context).data


class CommentViewSet(viewsets.ModelViewSet):
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = None  # Disable pagination for comments

    def get_queryset(self):
        queryset = (
            Comment.objects.all()
            .select_related("author", "author__profile")
            .prefetch_related("likes", "dislikes")
            .annotate(
                likes_count=Count("likes", distinct=True),
                dislikes_count=Count("dislikes", distinct=True),
                replies_count=Count("replies", distinct=True),
            )
        )
        
        # Filter by post if specified
        post_id = self.request.query_params.get("post")
        if post_id:
            queryset = queryset.filter(post_id=post_id, parent__isnull=True)
        
        return queryset.order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def _annotated_instance(self, comment):
        return (
            self.get_queryset()
            .filter(pk=comment.pk)
            .first()
        )

    @decorators.action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def like(self, request, pk=None):
        comment = self.get_object()
        user = request.user
        if comment.likes.filter(pk=user.pk).exists():
            comment.likes.remove(user)
        else:
            comment.dislikes.remove(user)
            comment.likes.add(user)

        refreshed = self._annotated_instance(comment)
        serializer = self.get_serializer(refreshed)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @decorators.action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def dislike(self, request, pk=None):
        comment = self.get_object()
        user = request.user
        if comment.dislikes.filter(pk=user.pk).exists():
            comment.dislikes.remove(user)
        else:
            comment.likes.remove(user)
            comment.dislikes.add(user)

        refreshed = self._annotated_instance(comment)
        serializer = self.get_serializer(refreshed)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ============ LIVESTREAM API ============

class LivestreamHostSerializer(serializers.ModelSerializer):
    """Minimal host info for stream cards"""
    profile_image = serializers.SerializerMethodField()
    followers_count = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'profile_image', 'followers_count']
    
    def get_profile_image(self, obj):
        profile = getattr(obj, 'profile', None)
        image = getattr(profile, 'image', None)
        if not image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(image.url)
        return image.url
    
    def get_followers_count(self, obj):
        from users.models import Follow
        return Follow.objects.filter(following=obj).count()


class LivestreamMessageSerializer(serializers.ModelSerializer):
    author = LivestreamHostSerializer(read_only=True)
    
    class Meta:
        model = LivestreamMessage
        fields = ['id', 'author', 'content', 'created_at', 'is_pinned']
        read_only_fields = ['id', 'author', 'created_at']


class LivestreamSignalSerializer(serializers.ModelSerializer):
    class Meta:
        model = LivestreamSignal
        fields = ['id', 'role', 'kind', 'payload', 'created_at']
        read_only_fields = ['id', 'created_at']


class LivestreamSerializer(serializers.ModelSerializer):
    host = LivestreamHostSerializer(read_only=True)
    thumbnail_url = serializers.SerializerMethodField()
    duration = serializers.ReadOnlyField()
    is_live = serializers.ReadOnlyField()
    is_owner = serializers.SerializerMethodField()
    
    class Meta:
        model = Livestream
        fields = [
            'id', 'host', 'title', 'description', 'thumbnail_url',
            'status', 'viewer_count', 'peak_viewers', 'total_likes',
            'scheduled_at', 'started_at', 'ended_at', 'created_at',
            'is_private', 'duration', 'is_live', 'is_owner'
        ]
        read_only_fields = ['id', 'host', 'viewer_count', 'peak_viewers', 'total_likes', 'started_at', 'ended_at']
    
    def get_thumbnail_url(self, obj):
        if not obj.thumbnail:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.thumbnail.url)
        return obj.thumbnail.url
    
    def get_is_owner(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.host_id == request.user.id
        return False


class LivestreamViewSet(viewsets.ModelViewSet):
    """
    Livestream API - Simple, beautiful, magical.
    
    list: Get all live/scheduled streams
    create: Start a new stream (authenticated)
    retrieve: Get stream details
    """
    serializer_class = LivestreamSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    lookup_field = 'id'
    
    def get_queryset(self):
        queryset = Livestream.objects.select_related('host', 'host__profile')
        
        # For detail views (retrieve, delete, etc.), return all streams
        # so we don't get 404s on valid IDs just because they are old/ended.
        if self.detail:
            return queryset
        
        # Filter by mine (user's own streams)
        mine_filter = self.request.query_params.get('mine')
        if mine_filter == 'true' and self.request.user.is_authenticated:
            return queryset.filter(host=self.request.user).order_by('-created_at')
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter == 'live':
            queryset = queryset.filter(status='live')
        elif status_filter == 'scheduled':
            queryset = queryset.filter(status='scheduled', scheduled_at__gte=timezone.now())
        elif status_filter != 'all':
            # Default: show live and recent ended (last 24h)
            queryset = queryset.filter(
                models.Q(status='live') | 
                models.Q(status='scheduled') |
                models.Q(status='ended', ended_at__gte=timezone.now() - timezone.timedelta(hours=24))
            )
        
        # Order: live first, then scheduled, then ended
        return queryset.order_by(
            models.Case(
                models.When(status='live', then=0),
                models.When(status='scheduled', then=1),
                default=2,
                output_field=models.IntegerField()
            ),
            '-viewer_count',
            '-created_at'
        )
    
    def perform_create(self, serializer):
        serializer.save(host=self.request.user)
    
    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def go_live(self, request, id=None):
        """One tap to go live - magic ✨"""
        stream = self.get_object()
        if stream.host != request.user:
            return Response({'error': 'Only the host can start the stream'}, status=status.HTTP_403_FORBIDDEN)
        if stream.status == 'live':
            return Response({'error': 'Stream is already live'}, status=status.HTTP_400_BAD_REQUEST)
        if stream.status == 'ended':
            return Response({'error': 'Stream has ended'}, status=status.HTTP_400_BAD_REQUEST)
        
        stream.start()
        return Response(self.get_serializer(stream).data)
    
    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def end_stream(self, request, id=None):
        """End the stream gracefully"""
        stream = self.get_object()
        if stream.host != request.user:
            return Response({'error': 'Only the host can end the stream'}, status=status.HTTP_403_FORBIDDEN)
        if stream.status != 'live':
            return Response({'error': 'Stream is not live'}, status=status.HTTP_400_BAD_REQUEST)
        
        stream.end()
        return Response(self.get_serializer(stream).data)
    
    @decorators.action(detail=True, methods=['delete'], permission_classes=[permissions.IsAuthenticated])
    def delete_stream(self, request, id=None):
        """Delete a stream - only by host"""
        stream = self.get_object()
        if stream.host != request.user:
            return Response({'error': 'Only the host can delete the stream'}, status=status.HTTP_403_FORBIDDEN)
        
        stream.delete()
        return Response({'detail': 'Stream deleted successfully'}, status=status.HTTP_204_NO_CONTENT)
    
    @decorators.action(detail=True, methods=['post'])
    def join(self, request, id=None):
        """Viewer joins the stream"""
        stream = self.get_object()
        if stream.status != 'live':
            return Response({'error': 'Stream is not live'}, status=status.HTTP_400_BAD_REQUEST)
        
        stream.viewer_count = models.F('viewer_count') + 1
        stream.save()
        stream.refresh_from_db()
        
        # Update peak viewers
        if stream.viewer_count > stream.peak_viewers:
            stream.peak_viewers = stream.viewer_count
            stream.save()
        
        return Response(self.get_serializer(stream).data)
    
    @decorators.action(detail=True, methods=['post'])
    def leave(self, request, id=None):
        """Viewer leaves the stream"""
        stream = self.get_object()
        if stream.viewer_count > 0:
            stream.viewer_count = models.F('viewer_count') - 1
            stream.save()
            stream.refresh_from_db()
        return Response(self.get_serializer(stream).data)
    
    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def like(self, request, id=None):
        """Send a like/heart during stream"""
        stream = self.get_object()
        if stream.status != 'live':
            return Response({'error': 'Stream is not live'}, status=status.HTTP_400_BAD_REQUEST)
        
        stream.total_likes = models.F('total_likes') + 1
        stream.save()
        stream.refresh_from_db()
        return Response({'total_likes': stream.total_likes})
    
    @decorators.action(detail=True, methods=['get', 'post'])
    def messages(self, request, id=None):
        """Get or send chat messages"""
        stream = self.get_object()
        
        if request.method == 'GET':
            # Get recent messages (last 100)
            messages = stream.messages.select_related('author', 'author__profile').order_by('-created_at')[:100]
            return Response(LivestreamMessageSerializer(reversed(list(messages)), many=True, context={'request': request}).data)
        
        # POST - send message
        if not request.user.is_authenticated:
            return Response({'error': 'Login required'}, status=status.HTTP_401_UNAUTHORIZED)
        if stream.status != 'live':
            return Response({'error': 'Stream is not live'}, status=status.HTTP_400_BAD_REQUEST)
        
        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Message cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
        if len(content) > 500:
            return Response({'error': 'Message too long'}, status=status.HTTP_400_BAD_REQUEST)
        
        message = LivestreamMessage.objects.create(
            stream=stream,
            author=request.user,
            content=content
        )
        return Response(LivestreamMessageSerializer(message, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @decorators.action(detail=True, methods=['get', 'post'])
    def signals(self, request, id=None):
        """Lightweight signaling channel for WebRTC (offer/answer/candidates)"""
        stream = self.get_object()

        if request.method == 'GET':
            qs = stream.signals.order_by('created_at')
            since = request.query_params.get('since')
            if since:
                try:
                    since_dt = timezone.datetime.fromtimestamp(float(since), tz=timezone.utc)
                    qs = qs.filter(created_at__gt=since_dt)
                except Exception:
                    pass
            return Response(LivestreamSignalSerializer(qs, many=True).data)

        # POST
        role = request.data.get('role')
        kind = request.data.get('kind')
        payload = request.data.get('payload')
        if role not in ['host', 'viewer'] or kind not in ['offer', 'answer', 'candidate']:
            return Response({'error': 'Invalid role or kind'}, status=status.HTTP_400_BAD_REQUEST)
        if payload is None:
            return Response({'error': 'Missing payload'}, status=status.HTTP_400_BAD_REQUEST)
        signal = LivestreamSignal.objects.create(stream=stream, role=role, kind=kind, payload=payload)
        # Keep table small: prune old signals per stream
        excess = stream.signals.order_by('-created_at')[100:]
        if excess:
            stream.signals.filter(id__in=[s.id for s in excess]).delete()
        return Response(LivestreamSignalSerializer(signal).data, status=status.HTTP_201_CREATED)
