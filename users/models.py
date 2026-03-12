from django.db import models
from django.contrib.auth.models import User
from django.urls import reverse
from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
from django.utils import timezone
import uuid


class Follow(models.Model):
    """Model to track user follow relationships."""
    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name='following')
    following = models.ForeignKey(User, on_delete=models.CASCADE, related_name='followers')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('follower', 'following')
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.follower.username} follows {self.following.username}'


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    image = models.ImageField(default='default.png', upload_to='profile_pics')
    bio = models.TextField(blank=True, default='')
    last_seen = models.DateTimeField(auto_now=True)
    email_verified = models.BooleanField(default=False)

    def __str__(self):
        return f'{self.user.username} Profile'

    @property
    def is_online(self):
        """User is considered online if active in the last 45 seconds."""
        if not self.last_seen:
            return False
        return (timezone.now() - self.last_seen).total_seconds() < 45

    def get_absolute_url(self):
        return reverse('post-detail', kwargs={'pk': self.pk})

    def save(self, *args, **kwargs):
        # Save first to get access to self.image.file
        super().save(*args, **kwargs)

        if self.image:
            try:
                # Open image from file-like object (works with S3)
                img = Image.open(self.image)

                if img.height > 300 or img.width > 300:
                    output_size = (300, 300)
                    img.thumbnail(output_size)

                    buffer = BytesIO()
                    img.save(buffer, format='JPEG')
                    buffer.seek(0)

                    # Overwrite original image with resized one
                    self.image.save(self.image.name, ContentFile(buffer.read()), save=False)
                    buffer.close()

                    # Save again with resized image
                    super().save(*args, **kwargs)

            except Exception as e:
                print(f"Image resizing failed: {e}")


# ============ CHAT / MESSAGING MODELS ============

class Conversation(models.Model):
    """A conversation between two or more users"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participants = models.ManyToManyField(User, related_name='conversations')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # For message requests from non-followers
    is_request = models.BooleanField(default=False)
    request_status = models.CharField(
        max_length=20, 
        choices=[('pending', 'Pending'), ('accepted', 'Accepted'), ('declined', 'Declined')],
        default='accepted'
    )
    
    class Meta:
        ordering = ['-updated_at']
    
    def __str__(self):
        usernames = ', '.join([u.username for u in self.participants.all()[:3]])
        return f"Conversation: {usernames}"
    
    def get_other_participant(self, user):
        """Get the other user in a 2-person conversation"""
        return self.participants.exclude(id=user.id).first()
    
    def get_last_message(self):
        """Get the most recent message"""
        return self.messages.order_by('-created_at').first()
    
    def get_unread_count(self, user):
        """Count unread messages for a user"""
        return self.messages.filter(read_at__isnull=True).exclude(sender=user).count()


class DirectMessage(models.Model):
    """A message within a conversation"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')
    content = models.TextField(max_length=5000)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    # Message types
    MESSAGE_TYPES = [
        ('text', 'Text'),
        ('image', 'Image'),
        ('post_share', 'Post Share'),
        ('voice', 'Voice'),
    ]
    message_type = models.CharField(max_length=20, choices=MESSAGE_TYPES, default='text')
    attachment_url = models.URLField(max_length=500, null=True, blank=True)
    shared_post_id = models.CharField(max_length=50, null=True, blank=True)
    
    # Soft delete for "unsend"
    is_unsent = models.BooleanField(default=False)
    
    # E2EE: True if content is encrypted (ciphertext + nonce in base64)
    is_encrypted = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['created_at']
    
    def __str__(self):
        return f"{self.sender.username}: {self.content[:50]}"
    
    def mark_as_read(self):
        """Mark message as read"""
        from django.utils import timezone
        if not self.read_at:
            self.read_at = timezone.now()
            self.save(update_fields=['read_at'])


class UserActivity(models.Model):
    """Track daily user activity for streak calculation"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='activities')
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('user', 'date')
        ordering = ['-date']
    
    def __str__(self):
        return f"{self.user.username} - {self.date}"


# ============ E2EE PUBLIC KEY STORAGE ============

class UserPublicKey(models.Model):
    """
    Stores the user's X25519 public key for E2EE chat.
    
    SECURITY NOTES:
    - The private key is stored client-side only (browser IndexedDB)
    - Server never sees or stores private keys
    - One key pair per user (not per-conversation)
    - Key is Base64-encoded raw public key bytes
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='e2ee_public_key')
    key_data = models.TextField(help_text="Base64-encoded X25519 public key")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "User Public Key"
        verbose_name_plural = "User Public Keys"
    
    def __str__(self):
        return f"{self.user.username}'s public key"


# ============ ACHIEVEMENTS / MILESTONES ============

class UserAchievement(models.Model):
    """
    Track user achievements/milestones.
    
    Achievements are awarded once and stored permanently.
    The frontend checks for pending achievements on login.
    """
    ACHIEVEMENT_CHOICES = [
        ('first_post', 'First Post'),
        ('rising_star', 'Rising Star'),
        ('karma_king', 'Karma King'),
        ('week_warrior', 'Week Warrior'),
        ('community_builder', 'Community Builder'),
        ('social_butterfly', 'Social Butterfly'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='achievements')
    achievement_id = models.CharField(max_length=50, choices=ACHIEVEMENT_CHOICES)
    earned_at = models.DateTimeField(auto_now_add=True)
    shown_to_user = models.BooleanField(default=False)
    
    class Meta:
        unique_together = ('user', 'achievement_id')
        ordering = ['-earned_at']
    
    def __str__(self):
        return f"{self.user.username} - {self.achievement_id}"


# ============ NOTIFICATIONS ============

class Notification(models.Model):
    """
    User notifications for social activity.

    Supports: likes, comments, follows, and comment replies.
    Delivered in real-time via WebSocket and persisted for later retrieval.
    """
    NOTIFICATION_TYPES = [
        ('like', 'Like'),
        ('comment', 'Comment'),
        ('follow', 'Follow'),
        ('reply', 'Reply'),
        ('sphere', 'Sphere'),
    ]

    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    actor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='actions')
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES)
    # Optional references to the related object
    post_slug = models.CharField(max_length=300, blank=True, default='')
    post_title = models.CharField(max_length=300, blank=True, default='')
    comment_id = models.IntegerField(null=True, blank=True)
    community_slug = models.CharField(max_length=140, blank=True, default='')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', '-created_at']),
            models.Index(fields=['recipient', 'is_read']),
        ]

    def __str__(self):
        return f"{self.actor.username} -> {self.recipient.username}: {self.notification_type}"


# ============ USER SETTINGS ============

class UserSettings(models.Model):
    """Per-user preferences for notifications, privacy, etc."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='settings')

    # Notification preferences
    notify_likes = models.BooleanField(default=True)
    notify_comments = models.BooleanField(default=True)
    notify_follows = models.BooleanField(default=True)
    notify_replies = models.BooleanField(default=True)
    email_notifications = models.BooleanField(default=False)

    # Privacy
    VISIBILITY_CHOICES = [
        ('public', 'Public'),
        ('followers', 'Followers Only'),
        ('private', 'Private'),
    ]
    profile_visibility = models.CharField(
        max_length=20, choices=VISIBILITY_CHOICES, default='public'
    )
    show_online_status = models.BooleanField(default=True)

    WHO_CAN_MESSAGE_CHOICES = [
        ('everyone', 'Everyone'),
        ('followers', 'Followers'),
        ('nobody', 'Nobody'),
    ]
    who_can_message = models.CharField(
        max_length=20, choices=WHO_CAN_MESSAGE_CHOICES, default='everyone'
    )

    class Meta:
        verbose_name = "User Settings"
        verbose_name_plural = "User Settings"

    def __str__(self):
        return f"{self.user.username}'s settings"


class Block(models.Model):
    """User A blocks User B — B cannot see A's content or interact."""
    blocker = models.ForeignKey(User, on_delete=models.CASCADE, related_name='blocking')
    blocked = models.ForeignKey(User, on_delete=models.CASCADE, related_name='blocked_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('blocker', 'blocked')
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.blocker.username} blocked {self.blocked.username}'


class Mute(models.Model):
    """User A mutes User B — B's content is hidden from A's feeds."""
    muter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='muting')
    muted = models.ForeignKey(User, on_delete=models.CASCADE, related_name='muted_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('muter', 'muted')
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.muter.username} muted {self.muted.username}'


class Report(models.Model):
    """User reports content (user, post, or comment) for moderation."""
    REASON_CHOICES = [
        ('spam', 'Spam'),
        ('harassment', 'Harassment or bullying'),
        ('hate_speech', 'Hate speech'),
        ('violence', 'Violence or threats'),
        ('nudity', 'Nudity or sexual content'),
        ('misinformation', 'Misinformation'),
        ('impersonation', 'Impersonation'),
        ('other', 'Other'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('reviewed', 'Reviewed'),
        ('resolved', 'Resolved'),
        ('dismissed', 'Dismissed'),
    ]
    CONTENT_TYPE_CHOICES = [
        ('user', 'User'),
        ('post', 'Post'),
        ('comment', 'Comment'),
    ]

    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reports_filed')
    content_type = models.CharField(max_length=10, choices=CONTENT_TYPE_CHOICES)
    # Exactly one of these should be set, depending on content_type
    reported_user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='reports_received')
    reported_post = models.ForeignKey('blog.Post', on_delete=models.CASCADE, null=True, blank=True, related_name='reports')
    reported_comment = models.ForeignKey('blog.Comment', on_delete=models.CASCADE, null=True, blank=True, related_name='reports')
    reason = models.CharField(max_length=20, choices=REASON_CHOICES)
    description = models.TextField(blank=True, default='')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        target = self.reported_user or self.reported_post or self.reported_comment
        return f'Report by {self.reporter.username}: {self.content_type} ({target}) - {self.reason}'
