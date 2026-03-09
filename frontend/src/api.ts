import axios from 'axios'
import type { Paginated, Post, User, PostFormData, Comment, CommentFormData, Community } from './types'

// Use relative URL so requests go through Vite proxy in dev
const apiBase = import.meta.env.VITE_API_BASE ?? '/api'

const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
})

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/csrftoken=([^;]+)/)
  return match ? match[1] : null
}

api.interceptors.request.use((config) => {
  const token = getCsrfToken()
  if (token) {
    config.headers = config.headers ?? {}
    if (!('X-CSRFToken' in config.headers)) {
      config.headers['X-CSRFToken'] = token
    }
  }
  return config
})

// Ensure CSRF cookie is set
export async function fetchCsrf(): Promise<void> {
  await api.get('/csrf/')
}

// Posts
export async function fetchPosts(page = 1): Promise<Paginated<Post>> {
  const { data } = await api.get<Paginated<Post>>('/posts/', { params: { page } })
  return data
}

export async function fetchPost(identifier: string): Promise<Post> {
  const { data } = await api.get<Post>(`/posts/${identifier}/`)
  return data
}

export async function createPost(postData: PostFormData): Promise<Post> {
  const formData = new FormData()
  formData.append('title', postData.title)
  formData.append('content', postData.content)

  if (postData.community_slug) {
    formData.append('community_slug', postData.community_slug)
  }
  if (postData.post_image) {
    formData.append('post_image', postData.post_image)
  }
  if (postData.post_video) {
    formData.append('post_video', postData.post_video)
  }
  const { data } = await api.post<Post>('/posts/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function updatePost(identifier: string, postData: PostFormData): Promise<Post> {
  const formData = new FormData()
  formData.append('title', postData.title)
  formData.append('content', postData.content)
  if (postData.post_image) {
    formData.append('post_image', postData.post_image)
  }
  if (postData.post_video) {
    formData.append('post_video', postData.post_video)
  }
  const { data } = await api.patch<Post>(`/posts/${identifier}/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function deletePost(identifier: string): Promise<void> {
  await api.delete(`/posts/${identifier}/`)
}

export async function likePost(identifier: string): Promise<Post> {
  const { data } = await api.post<Post>(`/posts/${identifier}/like/`)
  return data
}

export async function dislikePost(identifier: string): Promise<Post> {
  const { data } = await api.post<Post>(`/posts/${identifier}/dislike/`)
  return data
}

// Auth
export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const { data } = await api.get<User>('/auth/user/')
    return data
  } catch {
    return null
  }
}

export async function login(username: string, password: string): Promise<User> {
  const { data } = await api.post<User>('/auth/login/', { username, password })
  return data
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout/')
}

export async function register(username: string, email: string, password: string): Promise<User> {
  const { data } = await api.post<User>('/auth/register/', { username, email, password })
  return data
}

// Email Verification
export async function verifyEmail(token: string): Promise<{ detail: string }> {
  const { data } = await api.post<{ detail: string }>('/auth/verify-email/', { token })
  return data
}

export async function resendVerificationEmail(): Promise<{ detail: string }> {
  const { data } = await api.post<{ detail: string }>('/auth/verify-email/resend/')
  return data
}

// Password Reset
export async function requestPasswordReset(email: string): Promise<{ detail: string }> {
  const { data } = await api.post<{ detail: string }>('/auth/password/reset/', { email })
  return data
}

export async function confirmPasswordReset(
  uid: string, token: string, new_password: string
): Promise<{ detail: string }> {
  const { data } = await api.post<{ detail: string }>('/auth/password/reset/confirm/', {
    uid, token, new_password
  })
  return data
}

// Profile
export async function updateProfile(profileData: {
  bio?: string
  image?: File
  first_name?: string
  last_name?: string
  email?: string
}): Promise<User> {
  const formData = new FormData()
  if (profileData.bio !== undefined) formData.append('bio', profileData.bio)
  if (profileData.image) formData.append('image', profileData.image)
  if (profileData.first_name !== undefined) formData.append('first_name', profileData.first_name)
  if (profileData.last_name !== undefined) formData.append('last_name', profileData.last_name)
  if (profileData.email !== undefined) formData.append('email', profileData.email)
  const { data } = await api.patch<User>('/auth/user/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export interface UserProfile {
  id?: number
  username: string
  first_name?: string
  email?: string
  bio?: string
  profile_image?: string
  posts_count?: number
  followers_count?: number
  following_count?: number
  is_following?: boolean
  is_verified?: boolean
  posts?: Post[]
}

// Search types
export interface SearchUser {
  id: number
  username: string
  first_name: string
  last_name: string
  profile_image: string | null
  followers_count: number
  bio?: string
}

export interface SearchPost {
  id: number
  public_id: string
  slug: string
  title: string
  content: string
  post_image_url: string | null
  date_posted: string
  author: SearchUser
  likes_count: number
  comments_count: number
}

export interface SearchResults {
  users: SearchUser[]
  posts: SearchPost[]
}

export async function searchAll(query: string): Promise<SearchResults> {
  const { data } = await api.get<SearchResults>('/search/', { params: { q: query } })
  return data
}

export async function fetchUserProfile(username: string): Promise<UserProfile> {
  const { data } = await api.get<UserProfile>(`/users/${username}/`)
  return data
}

// Comments
export async function fetchComments(postId: number): Promise<Comment[]> {
  const { data } = await api.get<Comment[]>('/comments/', { params: { post: postId } })
  return data
}

export async function createComment(commentData: CommentFormData): Promise<Comment> {
  const { data } = await api.post<Comment>('/comments/', commentData)
  return data
}

export async function deleteComment(id: number): Promise<void> {
  await api.delete(`/comments/${id}/`)
}

export async function likeComment(id: number): Promise<Comment> {
  const { data } = await api.post<Comment>(`/comments/${id}/like/`)
  return data
}

export async function dislikeComment(id: number): Promise<Comment> {
  const { data } = await api.post<Comment>(`/comments/${id}/dislike/`)
  return data
}

// ============ LIVESTREAM API ============

export interface Livestream {
  id: string
  host: {
    id: number
    username: string
    first_name: string
    last_name: string
    profile_image: string | null
    followers_count: number
  }
  title: string
  description: string
  thumbnail_url: string | null
  status: 'scheduled' | 'live' | 'ended'
  category: string
  viewer_count: number
  peak_viewers: number
  total_likes: number
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  is_private: boolean
  duration: number
  is_live: boolean
  is_owner: boolean
  total_messages: number
}

export interface LivestreamMessage {
  id: number
  author: {
    id: number
    username: string
    profile_image: string | null
  }
  content: string
  created_at: string
  is_pinned: boolean
}

export async function fetchLivestreams(status?: 'live' | 'scheduled' | 'all', category?: string): Promise<Livestream[]> {
  const params: Record<string, string> = {}
  if (status) params.status = status
  if (category) params.category = category
  const { data } = await api.get('/streams/', { params })
  // Some deployments might paginate streams; normalize to a plain array
  if (Array.isArray(data)) return data as Livestream[]
  if (Array.isArray((data as any)?.results)) return (data as any).results as Livestream[]
  return []
}

export async function fetchLivestream(id: string): Promise<Livestream> {
  const { data } = await api.get<Livestream>(`/streams/${id}/`)
  return data
}

export async function createLivestream(streamData: { title: string; description?: string; category?: string }): Promise<Livestream> {
  const { data } = await api.post<Livestream>('/streams/', streamData)
  return data
}

export async function goLive(id: string): Promise<Livestream> {
  const { data } = await api.post<Livestream>(`/streams/${id}/go_live/`)
  return data
}

export async function endStream(id: string): Promise<Livestream> {
  const { data } = await api.post<Livestream>(`/streams/${id}/end_stream/`)
  return data
}

export async function deleteStream(id: string): Promise<void> {
  await api.delete(`/streams/${id}/delete_stream/`)
}

export async function fetchMyStreams(): Promise<Livestream[]> {
  const { data } = await api.get('/streams/', { params: { mine: 'true' } })
  if (Array.isArray(data)) return data as Livestream[]
  if (Array.isArray((data as any)?.results)) return (data as any).results as Livestream[]
  return []
}

export async function joinStream(id: string): Promise<Livestream> {
  const { data } = await api.post<Livestream>(`/streams/${id}/join/`)
  return data
}

export async function leaveStream(id: string): Promise<Livestream> {
  const { data } = await api.post<Livestream>(`/streams/${id}/leave/`)
  return data
}

export async function likeStream(id: string): Promise<{ total_likes: number }> {
  const { data } = await api.post<{ total_likes: number }>(`/streams/${id}/like/`)
  return data
}

export async function fetchStreamMessages(id: string): Promise<LivestreamMessage[]> {
  const { data } = await api.get<LivestreamMessage[]>(`/streams/${id}/messages/`)
  return data
}

export async function sendStreamMessage(id: string, content: string): Promise<LivestreamMessage> {
  const { data } = await api.post<LivestreamMessage>(`/streams/${id}/messages/`, { content })
  return data
}

// WebRTC signaling (simple polling)
export interface StreamSignal {
  id: number
  role: 'host' | 'viewer'
  kind: 'offer' | 'answer' | 'candidate'
  payload: any
  created_at: string
}

export async function fetchStreamSignals(id: string, since?: number): Promise<StreamSignal[]> {
  const params = since ? { since } : {}
  const { data } = await api.get<StreamSignal[]>(`/streams/${id}/signals/`, { params })
  return data
}

export async function sendStreamSignal(id: string, signal: { role: 'host' | 'viewer'; kind: 'offer' | 'answer' | 'candidate'; payload: any }): Promise<StreamSignal> {
  const { data } = await api.post<StreamSignal>(`/streams/${id}/signals/`, signal)
  return data
}

// ============ CHAT / MESSAGING API ============

import type { Conversation, Message, ChatParticipant } from './types'

export async function fetchConversations(): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>('/conversations/')
  return data
}

export async function startConversation(username: string): Promise<Conversation> {
  const { data } = await api.post<Conversation>('/conversations/', { username })
  return data
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data } = await api.get<Message[]>(`/conversations/${conversationId}/messages/`)
  return data
}

export async function sendMessage(
  conversationId: string,
  content: string,
  messageType: 'text' | 'image' | 'post_share' | 'voice' = 'text',
  attachmentUrl?: string,
  sharedPostId?: string
): Promise<Message> {
  const { data } = await api.post<Message>(`/conversations/${conversationId}/messages/`, {
    content,
    message_type: messageType,
    attachment_url: attachmentUrl,
    shared_post_id: sharedPostId
  })
  return data
}

export async function conversationAction(conversationId: string, action: 'accept' | 'decline' | 'delete'): Promise<void> {
  await api.post(`/conversations/${conversationId}/action/`, { action })
}

export async function messageAction(messageId: string, action: 'unsend'): Promise<void> {
  await api.post(`/messages/${messageId}/action/`, { action })
}

export async function fetchMessageRequests(): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>('/message-requests/')
  return data
}

export async function fetchUnreadCount(): Promise<{ unread_count: number }> {
  const { data } = await api.get<{ unread_count: number }>('/unread-count/')
  return data
}

// ============ ACTIVITY / STREAK API ============

export interface UserStreakData {
  days: boolean[]
  current_streak: number
  week_start: string
}

export async function fetchUserStreak(): Promise<UserStreakData> {
  const { data } = await api.get<UserStreakData>('/activity/streak/')
  return data
}

export interface CommunityPulseData {
  pulse: number
  posts_count: number
  comments_count: number
  active_users: number
}

export async function fetchCommunityPulse(): Promise<CommunityPulseData> {
  const { data } = await api.get<CommunityPulseData>('/activity/pulse/')
  return data
}

// ============ E2EE PUBLIC KEY API ============

export interface PublicKeyData {
  username: string
  public_key: string
  updated_at?: string
}

/**
 * Fetch a user's public key for E2EE
 */
export async function fetchPublicKey(username: string): Promise<PublicKeyData> {
  const { data } = await api.get<PublicKeyData>(`/keys/${username}/`)
  return data
}

/**
 * Upload/update current user's public key
 */
export async function uploadPublicKey(publicKey: string): Promise<void> {
  await api.post('/keys/', { public_key: publicKey })
}

/**
 * Check if current user has a public key on server
 */
export async function fetchMyPublicKey(): Promise<PublicKeyData | null> {
  try {
    const { data } = await api.get<PublicKeyData>('/keys/me/')
    return data
  } catch {
    return null
  }
}

/**
 * Send an encrypted message
 */
export async function sendEncryptedMessage(
  conversationId: string,
  encryptedContent: string,
  messageType: 'text' | 'image' | 'post_share' | 'voice' = 'text'
): Promise<Message> {
  const { data } = await api.post<Message>(`/conversations/${conversationId}/messages/`, {
    content: encryptedContent,
    message_type: messageType,
    is_encrypted: true
  })
  return data
}

// ============ COMMUNITIES ============

export async function fetchCommunities(): Promise<Paginated<Community>> {
  const { data } = await api.get<Paginated<Community>>('/communities/')
  return data
}

export async function fetchMyCommunities(): Promise<Community[]> {
  // We can filter by members=me or similar if the API supports it, 
  // but for now let's just use the results from fetchCommunities and filter or add an endpoint.
  // Actually, I'll add a 'joined' filter to the backend if needed, but for now I'll just fetch all and filter.
  const { data } = await api.get<Paginated<Community>>('/communities/')
  return data.results.filter(c => c.is_member)
}

export async function fetchCommunity(slug: string): Promise<Community> {
  const { data } = await api.get<Community>(`/communities/${slug}/`)
  return data
}

export async function createCommunity(formData: FormData): Promise<Community> {
  const { data } = await api.post<Community>('/communities/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return data
}

export async function joinCommunity(slug: string): Promise<{ status: string; role: string }> {
  const { data } = await api.post(`/communities/${slug}/join/`)
  return data
}

export async function leaveCommunity(slug: string): Promise<{ status: string }> {
  const { data } = await api.post(`/communities/${slug}/leave/`)
  return data
}

// ============ TRENDING POSTS API ============

export interface TrendingPostsResponse {
  results: Post[]
  count: number
  algorithm: string
}

export async function fetchTrendingPosts(limit = 5): Promise<TrendingPostsResponse> {
  const { data } = await api.get<TrendingPostsResponse>('/posts/trending/', { params: { limit } })
  return data
}

// ============ NOTIFICATIONS API ============

import type { AppNotification } from './types'

export interface NotificationsResponse {
  notifications: AppNotification[]
  unread_count: number
}

export async function fetchNotifications(): Promise<NotificationsResponse> {
  const { data } = await api.get<NotificationsResponse>('/notifications/')
  return data
}

export async function fetchNotificationUnreadCount(): Promise<{ unread_count: number }> {
  const { data } = await api.get<{ unread_count: number }>('/notifications/unread-count/')
  return data
}

export async function markNotificationsRead(notificationIds?: number[]): Promise<void> {
  await api.post('/notifications/mark-read/', notificationIds ? { notification_ids: notificationIds } : {})
}

// ============ SETTINGS API ============

import type { UserSettings } from './types'

export async function fetchUserSettings(): Promise<UserSettings> {
  const { data } = await api.get<UserSettings>('/settings/')
  return data
}

export async function updateUserSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  const { data } = await api.patch<UserSettings>('/settings/', settings)
  return data
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ detail: string }> {
  const { data } = await api.post<{ detail: string }>('/auth/password/', {
    current_password: currentPassword,
    new_password: newPassword,
  })
  return data
}

export async function deleteAccount(password: string): Promise<void> {
  await api.post('/auth/delete-account/', { password })
}

// Default export for axios instance (for direct API calls)
export default api
