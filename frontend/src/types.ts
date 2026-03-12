export interface Author {
  id: number
  username: string
  first_name?: string
  last_name?: string
  profile_image?: string | null
  is_verified?: boolean
}

export interface Community {
  id: number
  name: string
  slug: string
  description: string
  icon_url?: string | null
  cover_image_url?: string | null
  creator: Author
  is_member: boolean
  user_role: 'admin' | 'moderator' | 'member' | null
  posts_count: number
  members_count: number
  is_private: boolean
  created_at: string
}

export interface Post {
  id: number
  public_id: string
  slug: string
  title: string
  content: string
  post_image_url?: string | null
  post_video_url?: string | null
  date_posted: string
  author: Author
  likes_count: number
  dislikes_count: number
  comments_count: number
  user_has_liked: boolean
  user_has_disliked: boolean
  views_count?: number
  community?: {
    name: string
    slug: string
  } | null
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface User {
  id: number
  username: string
  email: string
  first_name?: string
  last_name?: string
  is_verified?: boolean
  profile?: {
    image?: string | null
    bio?: string
    email_verified?: boolean
  }
}

export interface PostFormData {
  title: string
  content: string
  post_image?: File | null
  post_video?: File | null
  community_slug?: string | null
}

export interface Comment {
  id: number
  post: number
  author: Author
  parent: number | null
  content: string
  created_at: string
  updated_at: string
  likes_count: number
  dislikes_count: number
  user_has_liked: boolean
  user_has_disliked: boolean
  replies_count: number
  replies?: Comment[]
}

export interface CommentFormData {
  post: number
  content: string
  parent?: number | null
}

export interface UserProfile {
  id: number
  username: string
  first_name?: string
  last_name?: string
  profile_image?: string | null
  bio?: string
  is_verified?: boolean
  posts_count: number
  followers_count: number
  following_count: number
  is_following?: boolean
  posts?: Post[]
}

// ============ CHAT / MESSAGING ============

export interface ChatParticipant {
  id: number
  username: string
  first_name?: string
  last_name?: string
  profile_image?: string | null
  is_online?: boolean
  last_seen?: string
}

export interface Message {
  id: string
  conversation_id: string
  sender: ChatParticipant
  content: string
  created_at: string
  read_at?: string | null
  message_type: 'text' | 'image' | 'post_share' | 'voice'
  attachment_url?: string | null
  shared_post_id?: string | null
  reactions?: { emoji: string; user_id: number }[]
  is_unsent?: boolean
  is_encrypted?: boolean  // E2EE: true if content is encrypted ciphertext
}

export interface Conversation {
  id: string
  participants: ChatParticipant[]
  last_message?: Message | null
  unread_count: number
  updated_at: string
  is_muted?: boolean
  is_request?: boolean // true if this is a message request (non-follower)
  request_status?: 'pending' | 'accepted' | 'declined'
}

export interface MessageRequest {
  id: string
  from_user: ChatParticipant
  preview_message: string
  created_at: string
  status: 'pending' | 'accepted' | 'declined'
}

// ============ NOTIFICATIONS ============

export interface AppNotification {
  id: number
  type: 'like' | 'comment' | 'follow' | 'reply' | 'sphere'
  actor: {
    id: number
    username: string
    profile_image: string | null
  }
  post_slug: string | null
  post_title: string | null
  comment_id: number | null
  community_slug: string | null
  is_read: boolean
  created_at: string
}

// ============ SETTINGS ============

export interface UserSettings {
  notify_likes: boolean
  notify_comments: boolean
  notify_follows: boolean
  notify_replies: boolean
  email_notifications: boolean
  profile_visibility: 'public' | 'followers' | 'private'
  show_online_status: boolean
  who_can_message: 'everyone' | 'followers' | 'nobody'
}

// ============ SPHERES ============

export interface SphereStatus {
  is_live: boolean
  participant_count: number
  title: string | null
  conductor: {
    user_id: number
    username: string
    profile_image: string | null
  } | null
  room_id: string | null
}

export interface SphereJoinRequestItem {
  id: number
  user_id: number
  username: string
  profile_image: string | null
  created_at: string
}

// ============ BLOCK / MUTE / REPORT ============

export interface RelationshipStatus {
  is_blocked: boolean
  is_muted: boolean
  is_blocked_by: boolean
}

export interface BlockedUser {
  id: number
  username: string
  profile_image: string | null
  blocked_at: string
}

export interface MutedUser {
  id: number
  username: string
  profile_image: string | null
  muted_at: string
}

export interface ReportPayload {
  content_type: 'user' | 'post' | 'comment'
  reason: 'spam' | 'harassment' | 'hate_speech' | 'violence' | 'nudity' | 'misinformation' | 'impersonation' | 'other'
  description?: string
  username?: string
  post_id?: number
  comment_id?: number
}
