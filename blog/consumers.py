"""
WebSocket consumer for livestream chat, viewer tracking, and moderation.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.db.models import F


def _build_absolute_image_url(scope, image_url):
    """Build an absolute URL from a relative image URL using WebSocket scope."""
    if not image_url:
        return None
    if image_url.startswith(('http://', 'https://')):
        return image_url
    server = scope.get('server', ('localhost', 8000))
    scheme = 'https' if server[1] == 443 else 'http'
    return f'{scheme}://{server[0]}:{server[1]}{image_url}'


class LivestreamConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for livestream interactions.
    Handles real-time chat, viewer join/leave, likes, pinning, and banning.
    """

    async def connect(self):
        self.user = self.scope['user']
        self.stream_id = self.scope['url_route']['kwargs']['stream_id']
        self.room_group_name = f'stream_{self.stream_id}'
        self.is_banned = False

        if not self.user.is_authenticated:
            await self.close()
            return

        stream = await self.get_stream()
        if not stream:
            await self.close()
            return

        self.is_banned = await self.check_is_banned()

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        if not self.is_banned:
            await self.update_viewer_count(1)
            user_data = await self.get_user_data(self.user)
            await self.channel_layer.group_send(self.room_group_name, {
                'type': 'viewer_joined',
                'user': user_data,
            })

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            if not self.is_banned:
                await self.update_viewer_count(-1)
                await self.channel_layer.group_send(self.room_group_name, {
                    'type': 'viewer_left',
                    'user_id': self.user.id,
                })

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')

        if msg_type == 'chat_message':
            await self.handle_chat_message(data)
        elif msg_type == 'like':
            await self.handle_like()
        elif msg_type == 'pin_message':
            await self.handle_pin_message(data)
        elif msg_type == 'ban_user':
            await self.handle_ban_user(data)
        elif msg_type == 'ping':
            await self.send(text_data=json.dumps({'type': 'pong'}))

    # ---- Message Handlers ----

    async def handle_chat_message(self, data):
        if self.is_banned:
            await self.send(text_data=json.dumps({
                'type': 'error', 'message': 'You are banned from this chat',
            }))
            return
        content = data.get('content', '').strip()
        if not content or len(content) > 500:
            return
        msg = await self.save_message(content)
        await self.channel_layer.group_send(self.room_group_name, {
            'type': 'chat_message',
            'message': msg,
        })

    async def handle_like(self):
        total = await self.increment_likes()
        await self.channel_layer.group_send(self.room_group_name, {
            'type': 'like_sent',
            'user_id': self.user.id,
            'total_likes': total,
        })

    async def handle_pin_message(self, data):
        if not await self.check_is_host():
            return
        message_id = data.get('message_id')
        if message_id:
            await self.pin_message(message_id)
            await self.channel_layer.group_send(self.room_group_name, {
                'type': 'message_pinned',
                'message_id': message_id,
            })

    async def handle_ban_user(self, data):
        if not await self.check_is_host():
            return
        target_user_id = data.get('user_id')
        if target_user_id:
            await self.create_ban(target_user_id)
            await self.channel_layer.group_send(self.room_group_name, {
                'type': 'user_banned',
                'user_id': target_user_id,
            })

    # ---- Group Send Handlers (dispatched to each client) ----

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message': event['message'],
        }))

    async def viewer_joined(self, event):
        await self.send(text_data=json.dumps({
            'type': 'viewer_joined',
            'user': event['user'],
        }))

    async def viewer_left(self, event):
        await self.send(text_data=json.dumps({
            'type': 'viewer_left',
            'user_id': event['user_id'],
        }))

    async def like_sent(self, event):
        await self.send(text_data=json.dumps({
            'type': 'like_sent',
            'user_id': event['user_id'],
            'total_likes': event['total_likes'],
        }))

    async def stream_ended(self, event):
        await self.send(text_data=json.dumps({
            'type': 'stream_ended',
            'stream_id': event['stream_id'],
        }))

    async def message_pinned(self, event):
        await self.send(text_data=json.dumps({
            'type': 'message_pinned',
            'message_id': event['message_id'],
        }))

    async def user_banned(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_banned',
            'user_id': event['user_id'],
        }))

    # ---- Database Access ----

    @database_sync_to_async
    def get_stream(self):
        from blog.models import Livestream
        return Livestream.objects.filter(id=self.stream_id, status='live').first()

    @database_sync_to_async
    def save_message(self, content):
        from blog.models import LivestreamMessage
        from users.models import Profile
        msg = LivestreamMessage.objects.create(
            stream_id=self.stream_id,
            author=self.user,
            content=content,
        )
        profile_image = None
        try:
            profile = Profile.objects.get(user_id=self.user.id)
            if profile.image:
                profile_image = profile.image.url
        except Profile.DoesNotExist:
            pass
        return {
            'id': msg.id,
            'author': {
                'id': self.user.id,
                'username': self.user.username,
                'profile_image': _build_absolute_image_url(self.scope, profile_image),
            },
            'content': msg.content,
            'created_at': msg.created_at.isoformat(),
            'is_pinned': msg.is_pinned,
        }

    @database_sync_to_async
    def update_viewer_count(self, delta):
        from blog.models import Livestream
        if delta > 0:
            Livestream.objects.filter(id=self.stream_id).update(
                viewer_count=F('viewer_count') + 1,
            )
            # Update peak_viewers if current exceeds it
            stream = Livestream.objects.filter(id=self.stream_id).first()
            if stream and stream.viewer_count > stream.peak_viewers:
                stream.peak_viewers = stream.viewer_count
                stream.save(update_fields=['peak_viewers'])
        else:
            Livestream.objects.filter(
                id=self.stream_id, viewer_count__gt=0
            ).update(viewer_count=F('viewer_count') - 1)

    @database_sync_to_async
    def increment_likes(self):
        from blog.models import Livestream
        Livestream.objects.filter(id=self.stream_id).update(
            total_likes=F('total_likes') + 1,
        )
        stream = Livestream.objects.filter(id=self.stream_id).values_list('total_likes', flat=True).first()
        return stream or 0

    @database_sync_to_async
    def check_is_host(self):
        from blog.models import Livestream
        return Livestream.objects.filter(id=self.stream_id, host=self.user).exists()

    @database_sync_to_async
    def check_is_banned(self):
        from blog.models import LivestreamBan
        return LivestreamBan.objects.filter(
            stream_id=self.stream_id, user=self.user,
        ).exists()

    @database_sync_to_async
    def create_ban(self, target_user_id):
        from blog.models import LivestreamBan
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            target = User.objects.get(id=target_user_id)
            LivestreamBan.objects.get_or_create(
                stream_id=self.stream_id,
                user=target,
                defaults={'banned_by': self.user},
            )
        except User.DoesNotExist:
            pass

    @database_sync_to_async
    def pin_message(self, message_id):
        from blog.models import LivestreamMessage
        # Unpin all others first, then pin the target
        LivestreamMessage.objects.filter(stream_id=self.stream_id, is_pinned=True).update(is_pinned=False)
        LivestreamMessage.objects.filter(id=message_id, stream_id=self.stream_id).update(is_pinned=True)

    @database_sync_to_async
    def get_user_data(self, user):
        from users.models import Profile
        profile_image = None
        try:
            profile = Profile.objects.get(user_id=user.id)
            if profile.image:
                profile_image = profile.image.url
        except Profile.DoesNotExist:
            pass
        return {
            'id': user.id,
            'username': user.username,
            'profile_image': _build_absolute_image_url(self.scope, profile_image),
        }
