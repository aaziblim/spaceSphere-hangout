"""
WebSocket consumers for real-time chat functionality.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import Conversation, DirectMessage

User = get_user_model()


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for handling real-time chat messages.
    Each user joins a personal room based on their user ID to receive messages.
    """

    async def connect(self):
        """Handle WebSocket connection."""
        self.user = self.scope['user']
        
        if not self.user.is_authenticated:
            await self.close()
            return
        
        # Update user's last_seen to mark them as online
        await self.update_user_last_seen()
        
        # Each user joins their own personal room
        self.room_name = f"user_{self.user.id}"
        self.room_group_name = f"chat_{self.room_name}"

        # Join the user's personal room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()
        
        # Send connection success message
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'message': 'Connected to chat server'
        }))
    
    @database_sync_to_async
    def update_user_last_seen(self):
        """Update user's last_seen timestamp."""
        if hasattr(self.user, 'profile'):
            self.user.profile.last_seen = timezone.now()
            self.user.profile.save(update_fields=['last_seen'])

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

    async def receive(self, text_data):
        """Handle incoming WebSocket messages."""
        try:
            # Update last_seen on any activity
            await self.update_user_last_seen()
            
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == 'chat_message':
                await self.handle_chat_message(data)
            elif message_type == 'typing':
                await self.handle_typing(data)
            elif message_type == 'mark_read':
                await self.handle_mark_read(data)
            elif message_type == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON'
            }))

    async def handle_chat_message(self, data):
        """Handle sending a chat message."""
        conversation_id = data.get('conversation_id')
        content = data.get('content', '').strip()
        message_type = data.get('message_type', 'text')

        if not conversation_id or not content:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Missing conversation_id or content'
            }))
            return

        # Save message to database and get recipient
        message_data = await self.save_message(
            conversation_id, content, message_type
        )

        if message_data.get('error'):
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': message_data['error']
            }))
            return

        # Send message to recipient's room
        recipient_room = f"chat_user_{message_data['recipient_id']}"
        await self.channel_layer.group_send(
            recipient_room,
            {
                'type': 'chat_message',
                'message': message_data['message']
            }
        )

        # Also send confirmation back to sender
        await self.send(text_data=json.dumps({
            'type': 'message_sent',
            'message': message_data['message']
        }))

    async def handle_typing(self, data):
        """Handle typing indicator."""
        conversation_id = data.get('conversation_id')
        is_typing = data.get('is_typing', False)

        recipient_id = await self.get_conversation_recipient(conversation_id)
        if recipient_id:
            recipient_room = f"chat_user_{recipient_id}"
            await self.channel_layer.group_send(
                recipient_room,
                {
                    'type': 'typing_indicator',
                    'conversation_id': conversation_id,
                    'user_id': self.user.id,
                    'username': self.user.username,
                    'is_typing': is_typing
                }
            )

    async def handle_mark_read(self, data):
        """Handle marking messages as read."""
        conversation_id = data.get('conversation_id')
        
        if conversation_id:
            read_count = await self.mark_messages_read(conversation_id)
            
            # Notify the other user that messages were read
            recipient_id = await self.get_conversation_recipient(conversation_id)
            if recipient_id:
                recipient_room = f"chat_user_{recipient_id}"
                await self.channel_layer.group_send(
                    recipient_room,
                    {
                        'type': 'messages_read',
                        'conversation_id': conversation_id,
                        'reader_id': self.user.id,
                        'count': read_count
                    }
                )

    # Channel layer message handlers
    async def chat_message(self, event):
        """Send chat message to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'new_message',
            'message': event['message']
        }))

    async def typing_indicator(self, event):
        """Send typing indicator to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'typing',
            'conversation_id': event['conversation_id'],
            'user_id': event['user_id'],
            'username': event['username'],
            'is_typing': event['is_typing']
        }))

    async def messages_read(self, event):
        """Send messages read notification to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'messages_read',
            'conversation_id': event['conversation_id'],
            'reader_id': event['reader_id'],
            'count': event['count']
        }))

    # Database operations
    @database_sync_to_async
    def save_message(self, conversation_id, content, message_type):
        """Save a message to the database."""
        try:
            conversation = Conversation.objects.get(id=conversation_id)
            
            # Check if user is participant
            if self.user not in conversation.participants.all():
                return {'error': 'Not a participant in this conversation'}
            
            # Check if conversation is accepted (not a pending request)
            if conversation.is_request and conversation.request_status == 'pending':
                # Only the original sender can send messages to pending requests
                first_msg = conversation.messages.order_by('created_at').first()
                if first_msg and first_msg.sender != self.user:
                    return {'error': 'Cannot send messages to pending requests'}
            
            # Get recipient
            recipient = conversation.participants.exclude(id=self.user.id).first()
            
            # Create the message
            message = DirectMessage.objects.create(
                conversation=conversation,
                sender=self.user,
                content=content,
                message_type=message_type
            )
            
            # Update conversation timestamp
            conversation.updated_at = timezone.now()
            conversation.save()
            
            return {
                'message': {
                    'id': str(message.id),
                    'conversation_id': str(conversation.id),
                    'sender': {
                        'id': self.user.id,
                        'username': self.user.username,
                        'profile_image': self.user.profile.image.url if hasattr(self.user, 'profile') and self.user.profile.image else None
                    },
                    'content': message.content,
                    'message_type': message.message_type,
                    'created_at': message.created_at.isoformat(),
                    'is_unsent': message.is_unsent
                },
                'recipient_id': recipient.id if recipient else None
            }
        except Conversation.DoesNotExist:
            return {'error': 'Conversation not found'}

    @database_sync_to_async
    def get_conversation_recipient(self, conversation_id):
        """Get the other participant in a conversation."""
        try:
            conversation = Conversation.objects.get(id=conversation_id)
            recipient = conversation.participants.exclude(id=self.user.id).first()
            return recipient.id if recipient else None
        except Conversation.DoesNotExist:
            return None

    @database_sync_to_async
    def mark_messages_read(self, conversation_id):
        """Mark all unread messages in a conversation as read."""
        try:
            conversation = Conversation.objects.get(id=conversation_id)
            messages = DirectMessage.objects.filter(
                conversation=conversation,
                read_at__isnull=True
            ).exclude(sender=self.user)
            
            count = messages.count()
            messages.update(read_at=timezone.now())
            return count
        except Conversation.DoesNotExist:
            return 0

class SpheresConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for 'Spheres' (The Nebula) audio spaces.
    Handles real-time syncing of orb positions, physics, and talking state.
    """

    async def connect(self):
        self.user = self.scope['user']
        if not self.user.is_authenticated:
            await self.close()
            return

        self.slug = self.scope['url_route']['kwargs']['slug']
        self.room_group_name = f'sphere_{self.slug}'

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

        # Broadcast join event
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_joined',
                'user': {
                    'id': self.user.id,
                    'username': self.user.username,
                    'image': self.user.profile.image.url if hasattr(self.user, 'profile') and self.user.profile.image else None
                }
            }
        )

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        
        # Broadcast leave event
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_left',
                'user_id': self.user.id
            }
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get('type')

        # Directly relay physics updates to the group (high frequency)
        if message_type == 'orb_update':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'orb_update',
                    'orb': data.get('orb'),
                    'sender_channel_name': self.channel_name
                }
            )
        elif message_type == 'emote_burst':
             await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'emote_burst',
                    'user_id': self.user.id,
                    'emote': data.get('emote', '❤️'),
                    'sender_channel_name': self.channel_name
                }
            )
        elif message_type == 'hand_raise':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'hand_raise',
                    'user_id': self.user.id,
                    'username': self.user.username,
                    'raised': data.get('raised', True),
                }
            )
        elif message_type in ('mute_speaker', 'remove_from_room', 'lock_room'):
            # Moderation — only hosts can do these
            is_host = await self._is_conductor()
            if not is_host:
                return
            if message_type == 'mute_speaker':
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'force_mute',
                        'target_user_id': data.get('target_user_id'),
                    }
                )
            elif message_type == 'remove_from_room':
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'user_removed',
                        'target_user_id': data.get('target_user_id'),
                        'removed_by': self.user.username,
                    }
                )
            elif message_type == 'lock_room':
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'room_locked',
                        'locked': data.get('locked', True),
                    }
                )

    @database_sync_to_async
    def _is_conductor(self):
        from blog.models import CommunityMembership
        return CommunityMembership.objects.filter(
            user=self.user, community__slug=self.slug, role__in=('admin', 'moderator')
        ).exists()

    # Handlers
    async def user_joined(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_joined',
            'user': event['user']
        }))

    async def user_left(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_left',
            'user_id': event['user_id']
        }))

    async def orb_update(self, event):
        # Don't send back to self to save bandwidth/latency if we wanted, 
        # but for simple authoritative sync, echoing is fine or filtering.
        # Here we filter out self to prevent jitter/loops if client predicts physics.
        if event.get('sender_channel_name') == self.channel_name:
            return

        await self.send(text_data=json.dumps({
            'type': 'orb_update',
            'orb': event['orb']
        }))

    async def emote_burst(self, event):
        await self.send(text_data=json.dumps({
            'type': 'emote_burst',
            'user_id': event['user_id'],
            'emote': event['emote']
        }))

    async def hand_raise(self, event):
        await self.send(text_data=json.dumps({
            'type': 'hand_raise',
            'user_id': event['user_id'],
            'username': event['username'],
            'raised': event['raised'],
        }))

    async def role_change(self, event):
        await self.send(text_data=json.dumps({
            'type': 'role_change',
            'user_id': event['user_id'],
            'new_role': event['new_role'],
        }))

    async def force_mute(self, event):
        await self.send(text_data=json.dumps({
            'type': 'force_mute',
            'target_user_id': event['target_user_id'],
        }))

    async def user_removed(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_removed',
            'target_user_id': event['target_user_id'],
            'removed_by': event['removed_by'],
        }))

    async def room_locked(self, event):
        await self.send(text_data=json.dumps({
            'type': 'room_locked',
            'locked': event['locked'],
        }))


class NotificationConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time notification delivery.
    Each authenticated user joins a personal group to receive notifications.
    """

    async def connect(self):
        self.user = self.scope['user']
        if not self.user.is_authenticated:
            await self.close()
            return

        self.group_name = f'notifications_{self.user.id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Client can send ping for keep-alive
        try:
            data = json.loads(text_data)
            if data.get('type') == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except (json.JSONDecodeError, TypeError):
            pass

    async def send_notification(self, event):
        """Called by channel layer when a notification is created."""
        await self.send(text_data=json.dumps({
            'type': 'notification',
            'notification': event['notification'],
        }))
