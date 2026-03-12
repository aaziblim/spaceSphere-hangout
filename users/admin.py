from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import (
    Profile, Follow, Conversation, DirectMessage,
    UserActivity, UserPublicKey, UserAchievement, UserSettings,
    Block, Mute, Report,
)


# ============ INLINES ============

class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    verbose_name_plural = 'Profile'
    fields = ('image', 'bio', 'last_seen')
    readonly_fields = ('last_seen',)


class UserAchievementInline(admin.TabularInline):
    model = UserAchievement
    extra = 0
    readonly_fields = ('achievement_id', 'earned_at', 'shown_to_user')


# ============ EXTEND BUILT-IN USER ADMIN ============

class UserAdmin(BaseUserAdmin):
    inlines = [ProfileInline, UserAchievementInline]
    list_display = ('username', 'email', 'first_name', 'is_staff', 'is_active', 'date_joined', 'follower_count', 'post_count')
    list_filter = BaseUserAdmin.list_filter + ('date_joined',)

    def follower_count(self, obj):
        return obj.followers.count()
    follower_count.short_description = 'Followers'

    def post_count(self, obj):
        return obj.post_set.count()
    post_count.short_description = 'Posts'


# Re-register User with our enhanced admin
admin.site.unregister(User)
admin.site.register(User, UserAdmin)


# ============ MODEL ADMINS ============

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'bio_preview', 'is_online', 'last_seen')
    search_fields = ('user__username', 'user__email', 'bio')
    readonly_fields = ('last_seen',)
    list_per_page = 30

    def bio_preview(self, obj):
        return obj.bio[:60] + ('...' if len(obj.bio) > 60 else '') if obj.bio else '-'
    bio_preview.short_description = 'Bio'

    def is_online(self, obj):
        return obj.is_online
    is_online.boolean = True
    is_online.short_description = 'Online'


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ('follower', 'following', 'created_at')
    search_fields = ('follower__username', 'following__username')
    readonly_fields = ('created_at',)
    autocomplete_fields = ('follower', 'following')
    list_per_page = 50


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('id', 'participant_names', 'is_request', 'request_status', 'message_count', 'created_at', 'updated_at')
    list_filter = ('is_request', 'request_status', 'created_at')
    search_fields = ('participants__username',)
    readonly_fields = ('id', 'created_at', 'updated_at')
    list_per_page = 30

    def participant_names(self, obj):
        return ', '.join(u.username for u in obj.participants.all()[:4])
    participant_names.short_description = 'Participants'

    def message_count(self, obj):
        return obj.messages.count()
    message_count.short_description = 'Messages'


@admin.register(DirectMessage)
class DirectMessageAdmin(admin.ModelAdmin):
    list_display = ('sender', 'conversation', 'message_type', 'short_content', 'is_unsent', 'is_encrypted', 'created_at', 'read_at')
    list_filter = ('message_type', 'is_unsent', 'is_encrypted', 'created_at')
    search_fields = ('sender__username', 'content')
    readonly_fields = ('id', 'created_at')
    list_per_page = 50

    def short_content(self, obj):
        if obj.is_unsent:
            return '[unsent]'
        if obj.is_encrypted:
            return '[encrypted]'
        return obj.content[:60]
    short_content.short_description = 'Content'


@admin.register(UserActivity)
class UserActivityAdmin(admin.ModelAdmin):
    list_display = ('user', 'date', 'created_at')
    list_filter = ('date',)
    search_fields = ('user__username',)
    readonly_fields = ('created_at',)
    date_hierarchy = 'date'


@admin.register(UserPublicKey)
class UserPublicKeyAdmin(admin.ModelAdmin):
    list_display = ('user', 'created_at', 'updated_at')
    search_fields = ('user__username',)
    readonly_fields = ('key_data', 'created_at', 'updated_at')


@admin.register(UserAchievement)
class UserAchievementAdmin(admin.ModelAdmin):
    list_display = ('user', 'achievement_id', 'shown_to_user', 'earned_at')
    list_filter = ('achievement_id', 'shown_to_user')
    search_fields = ('user__username',)
    readonly_fields = ('earned_at',)


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    list_display = ('user', 'profile_visibility', 'show_online_status', 'email_notifications')
    list_filter = ('profile_visibility', 'email_notifications')


@admin.register(Block)
class BlockAdmin(admin.ModelAdmin):
    list_display = ('blocker', 'blocked', 'created_at')
    search_fields = ('blocker__username', 'blocked__username')
    readonly_fields = ('created_at',)
    autocomplete_fields = ('blocker', 'blocked')
    list_per_page = 50


@admin.register(Mute)
class MuteAdmin(admin.ModelAdmin):
    list_display = ('muter', 'muted', 'created_at')
    search_fields = ('muter__username', 'muted__username')
    readonly_fields = ('created_at',)
    autocomplete_fields = ('muter', 'muted')
    list_per_page = 50


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ('reporter', 'content_type', 'reason', 'status', 'created_at')
    list_filter = ('content_type', 'reason', 'status', 'created_at')
    search_fields = ('reporter__username', 'description')
    readonly_fields = ('reporter', 'content_type', 'reported_user', 'reported_post', 'reported_comment', 'reason', 'description', 'created_at')
    list_per_page = 50
    actions = ['mark_reviewed', 'mark_resolved', 'mark_dismissed']

    @admin.action(description='Mark selected reports as reviewed')
    def mark_reviewed(self, request, queryset):
        queryset.update(status='reviewed')

    @admin.action(description='Mark selected reports as resolved')
    def mark_resolved(self, request, queryset):
        from django.utils import timezone
        queryset.update(status='resolved', resolved_at=timezone.now())

    @admin.action(description='Dismiss selected reports')
    def mark_dismissed(self, request, queryset):
        queryset.update(status='dismissed')