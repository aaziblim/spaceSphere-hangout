from django.contrib import admin
from django.utils.html import format_html
from .models import Post, Comment, Community, CommunityMembership, Livestream, LivestreamMessage, LivestreamSignal


# ============ INLINES ============

class CommentInline(admin.TabularInline):
    model = Comment
    extra = 0
    readonly_fields = ('author', 'content', 'created_at', 'updated_at')
    fields = ('author', 'content', 'parent', 'created_at')
    show_change_link = True


class CommunityMembershipInline(admin.TabularInline):
    model = CommunityMembership
    extra = 0
    readonly_fields = ('joined_at',)
    autocomplete_fields = ('user',)


class LivestreamMessageInline(admin.TabularInline):
    model = LivestreamMessage
    extra = 0
    readonly_fields = ('author', 'content', 'created_at', 'is_pinned')


# ============ MODEL ADMINS ============

@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'community', 'date_posted', 'views_count', 'like_count', 'dislike_count', 'comment_count')
    list_filter = ('date_posted', 'community')
    search_fields = ('title', 'content', 'author__username', 'slug')
    readonly_fields = ('public_id', 'slug', 'views_count', 'date_posted')
    autocomplete_fields = ('author', 'community')
    date_hierarchy = 'date_posted'
    list_per_page = 30
    inlines = [CommentInline]

    def like_count(self, obj):
        return obj.likes.count()
    like_count.short_description = 'Likes'

    def dislike_count(self, obj):
        return obj.dislikes.count()
    dislike_count.short_description = 'Dislikes'

    def comment_count(self, obj):
        return obj.comments.count()
    comment_count.short_description = 'Comments'


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('short_content', 'author', 'post', 'parent', 'created_at', 'score')
    list_filter = ('created_at',)
    search_fields = ('content', 'author__username', 'post__title')
    readonly_fields = ('created_at', 'updated_at')
    autocomplete_fields = ('post', 'author', 'parent')
    list_per_page = 30

    def short_content(self, obj):
        return obj.content[:80] + ('...' if len(obj.content) > 80 else '')
    short_content.short_description = 'Content'


@admin.register(Community)
class CommunityAdmin(admin.ModelAdmin):
    list_display = ('name', 'creator', 'is_private', 'member_count', 'post_count', 'created_at')
    list_filter = ('is_private', 'created_at')
    search_fields = ('name', 'slug', 'description', 'creator__username')
    readonly_fields = ('slug', 'created_at')
    prepopulated_fields = {}  # slug is auto-generated in save()
    inlines = [CommunityMembershipInline]
    list_per_page = 30

    def member_count(self, obj):
        return obj.members.count()
    member_count.short_description = 'Members'

    def post_count(self, obj):
        return obj.posts.count()
    post_count.short_description = 'Posts'


@admin.register(CommunityMembership)
class CommunityMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'community', 'role', 'joined_at')
    list_filter = ('role', 'joined_at')
    search_fields = ('user__username', 'community__name')
    autocomplete_fields = ('user', 'community')


@admin.register(Livestream)
class LivestreamAdmin(admin.ModelAdmin):
    list_display = ('title', 'host', 'status', 'viewer_count', 'peak_viewers', 'total_likes', 'started_at', 'created_at')
    list_filter = ('status', 'is_private', 'created_at')
    search_fields = ('title', 'description', 'host__username')
    readonly_fields = ('id', 'viewer_count', 'peak_viewers', 'total_likes', 'created_at')
    inlines = [LivestreamMessageInline]
    list_per_page = 30

    actions = ['end_streams']

    @admin.action(description='End selected livestreams')
    def end_streams(self, request, queryset):
        count = queryset.filter(status='live').count()
        for stream in queryset.filter(status='live'):
            stream.end()
        self.message_user(request, f'{count} stream(s) ended.')


@admin.register(LivestreamMessage)
class LivestreamMessageAdmin(admin.ModelAdmin):
    list_display = ('author', 'stream', 'short_content', 'is_pinned', 'created_at')
    list_filter = ('is_pinned', 'created_at')
    search_fields = ('content', 'author__username')
    readonly_fields = ('created_at',)

    def short_content(self, obj):
        return obj.content[:60]
    short_content.short_description = 'Content'


@admin.register(LivestreamSignal)
class LivestreamSignalAdmin(admin.ModelAdmin):
    list_display = ('stream', 'role', 'kind', 'created_at')
    list_filter = ('role', 'kind')
    readonly_fields = ('created_at',)
