import uuid
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from django.urls import reverse
from django.utils.text import slugify

# Create your models here.

class Community(models.Model):
    """
    A community where users can gather and share.
    Steve Jobs would want this to be simple, focus on the 'why'.
    """
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True)
    cover_image = models.ImageField(upload_to='community_covers', blank=True, null=True)
    icon = models.ImageField(upload_to='community_icons', blank=True, null=True)
    creator = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_communities')
    members = models.ManyToManyField(User, through='CommunityMembership', related_name='joined_communities')
    
    is_private = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Communities"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

class CommunityMembership(models.Model):
    """Relationship between User and Community"""
    ROLE_CHOICES = [
        ('member', 'Member'),
        ('moderator', 'Moderator'),
        ('admin', 'Admin'),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    community = models.ForeignKey(Community, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='member')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'community')

class Post(models.Model):
    title = models.CharField(max_length=100)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    content = models.TextField()
    post_image = models.ImageField(upload_to='post_pics', blank=True, null=True)
    post_video = models.FileField(upload_to='post_videos', blank=True, null=True)
    date_posted = models.DateTimeField(default=timezone.now)
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    community = models.ForeignKey(Community, on_delete=models.SET_NULL, null=True, blank=True, related_name='posts')
    likes = models.ManyToManyField(User, related_name='liked_posts', blank=True)
    dislikes = models.ManyToManyField(User, related_name='disliked_posts', blank=True)
    views_count = models.PositiveIntegerField(default=0, help_text="Number of times this post has been viewed")

    def get_absolute_url(self):
        return reverse('blog-home')

    def save(self, *args, **kwargs):
        # Keep slug immutable after first assignment; re-use the stored value on updates.
        existing_slug = None
        if self.pk:
            existing_slug = Post.objects.filter(pk=self.pk).values_list('slug', flat=True).first()

        if existing_slug:
            self.slug = existing_slug
        elif not self.slug:
            base_slug = slugify(self.title)[:130] or slugify(str(self.public_id))
            slug_candidate = base_slug
            suffix = 1
            while Post.objects.filter(slug=slug_candidate).exclude(pk=self.pk).exists():
                slug_candidate = f"{base_slug}-{suffix}"
                suffix += 1
            self.slug = slug_candidate
        super().save(*args, **kwargs)

    @property
    def total_likes(self):
        return self.likes.count()

    @property
    def total_dislikes(self):
        return self.dislikes.count()


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='replies')
    content = models.TextField(max_length=1000)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    likes = models.ManyToManyField(User, related_name='liked_comments', blank=True)
    dislikes = models.ManyToManyField(User, related_name='disliked_comments', blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.author.username}: {self.content[:50]}'

    @property
    def score(self):
        return self.likes.count() - self.dislikes.count()


class Livestream(models.Model):
    """
    Livestream model for real-time broadcasting.
    Simple, elegant - the way Steve would want it.
    """
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('live', 'Live'),
        ('ended', 'Ended'),
    ]
    CATEGORY_CHOICES = [
        ('gaming', 'Gaming'),
        ('music', 'Music'),
        ('coding', 'Coding'),
        ('art', 'Art'),
        ('cooking', 'Cooking'),
        ('chat', 'Chat'),
        ('education', 'Education'),
        ('other', 'Other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    host = models.ForeignKey(User, on_delete=models.CASCADE, related_name='livestreams')
    title = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    thumbnail = models.ImageField(upload_to='stream_thumbnails', blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='chat')

    # Stream metadata
    viewer_count = models.PositiveIntegerField(default=0)
    peak_viewers = models.PositiveIntegerField(default=0)
    total_likes = models.PositiveIntegerField(default=0)

    # Timestamps
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # Privacy
    is_private = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f'{self.host.username} - {self.title}'
    
    def start(self):
        """Go live - one tap, magic happens"""
        self.status = 'live'
        self.started_at = timezone.now()
        self.save()
    
    def end(self):
        """End the stream gracefully"""
        self.status = 'ended'
        self.ended_at = timezone.now()
        self.save()
    
    @property
    def duration(self):
        """Stream duration in seconds"""
        if not self.started_at:
            return 0
        end = self.ended_at or timezone.now()
        return (end - self.started_at).total_seconds()
    
    @property
    def is_live(self):
        return self.status == 'live'

    @property
    def total_messages(self):
        return self.messages.count()


class LivestreamMessage(models.Model):
    """Chat messages during a livestream"""
    stream = models.ForeignKey(Livestream, on_delete=models.CASCADE, related_name='messages')
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    content = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    is_pinned = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['created_at']
    
    def __str__(self):
        return f'{self.author.username}: {self.content[:30]}'  


class LivestreamSignal(models.Model):
    """Lightweight signaling store for WebRTC offer/answer/candidates"""
    ROLE_CHOICES = [('host', 'Host'), ('viewer', 'Viewer')]
    KIND_CHOICES = [('offer', 'Offer'), ('answer', 'Answer'), ('candidate', 'Candidate')]
    stream = models.ForeignKey(Livestream, on_delete=models.CASCADE, related_name='signals')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.stream_id} {self.role} {self.kind}'


class LivestreamBan(models.Model):
    """Ban a user from chat during a livestream"""
    stream = models.ForeignKey(Livestream, on_delete=models.CASCADE, related_name='bans')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='stream_bans')
    banned_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='stream_bans_issued')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('stream', 'user')

    def __str__(self):
        return f'{self.user.username} banned from {self.stream_id}'


class SphereRoom(models.Model):
    """An audio room tied to a community, powered by LiveKit."""
    STATE_CHOICES = [
        ('live', 'Live'),
        ('ended', 'Ended'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    community = models.ForeignKey(Community, on_delete=models.CASCADE, related_name='sphere_rooms')
    title = models.CharField(max_length=200, blank=True, default='')
    state = models.CharField(max_length=10, choices=STATE_CHOICES, default='live')
    creator = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_spheres')
    participant_count = models.PositiveIntegerField(default=0)
    is_locked = models.BooleanField(default=False)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f'Sphere: {self.community.name} ({self.state})'

    def end(self):
        self.state = 'ended'
        self.ended_at = timezone.now()
        self.save(update_fields=['state', 'ended_at'])


class SphereParticipant(models.Model):
    """A user's participation in a sphere room."""
    ROLE_CHOICES = [
        ('conductor', 'Conductor'),
        ('speaker', 'Speaker'),
        ('listener', 'Listener'),
    ]
    room = models.ForeignKey(SphereRoom, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sphere_participations')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='listener')
    is_muted = models.BooleanField(default=True)
    hand_raised_at = models.DateTimeField(null=True, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('room', 'user')

    def __str__(self):
        return f'{self.user.username} in {self.room} ({self.role})'


class SphereJoinRequest(models.Model):
    """A non-member's request to join an active Sphere."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('denied', 'Denied'),
    ]
    room = models.ForeignKey(SphereRoom, on_delete=models.CASCADE, related_name='join_requests')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sphere_join_requests')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_sphere_requests'
    )

    class Meta:
        unique_together = ('room', 'user')
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.username} -> {self.room} ({self.status})'