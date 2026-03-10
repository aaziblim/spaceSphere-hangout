# Spherespace

Spherespace is a real-time social platform for creators and communities. It combines a React + TypeScript frontend with a Django REST + Channels backend to deliver messaging, creator tools, payments, and community features.

## Features

| Category | Features |
|----------|----------|
| Social | User profiles, following, posts, comments, communities |
| Real-time Chat | WebSocket messaging, typing indicators, read receipts, message requests |
| Notifications | Real-time WebSocket notifications for likes, comments, follows, and replies |
| Settings | Profile, account, appearance, notifications, privacy, security, and account deletion |
| Auth | Email/password, Google and GitHub OAuth, email verification, password reset |
| Gamification | Achievement badges, activity streaks, karma system |
| Creators | Verified badges, analytics dashboard, payment integration |
| Live Streaming | WebSocket chat, screen sharing, viewer moderation, stream categories, post-stream summary |
| Audio Spaces | Real-time spatial audio rooms with physics-based orbs, Conductor role, guest approval, and emote bursts |
| Payments | Paystack integration, subscription tiers (Blue, Premium, Organization), webhooks |
| UI/UX | Dark/light/system themes, skeleton loading, micro-interactions, custom 404 page |

## Screenshots

<div align="center">

### Homepage
<img src="docs/screenshots/homepage.png" alt="Spherespace Homepage" width="800"/>

---

### Community Page
<img src="docs/screenshots/community.png" alt="Community Page" width="800"/>

---

### Live Streaming
<img src="docs/screenshots/livestream.png" alt="Live Streaming Page" width="800"/>

---

### API Documentation
<img src="docs/screenshots/api-docs.png" alt="API Documentation" width="800"/>

</div>

## Architecture

```mermaid
graph TB
    subgraph Frontend["Frontend (React + Vite)"]
        UI[React Components]
        TQ[TanStack Query]
        WS[WebSocket Hook]
    end
    
    subgraph Backend["Backend (Django)"]
        DRF[Django REST Framework]
        CH[Django Channels]
        DA[Daphne ASGI]
    end
    
    subgraph Data["Data Layer"]
        PG[(PostgreSQL)]
        RD[(Redis)]
        S3[AWS S3 / Cloudinary]
    end
    
    UI --> TQ --> DRF
    UI --> WS --> CH --> DA
    DRF --> PG
    CH --> RD
    DRF --> S3
```

---

## Project Structure

```
my_project/
├── my_project/          # Django project settings
│   ├── settings.py
│   ├── urls.py
│   └── asgi.py          # Channels/WebSocket routing
├── users/               # User management
│   ├── models.py        # Profile, Follow, Conversation, DirectMessage, UserAchievement, UserSettings
│   ├── api.py           # REST endpoints (auth, profiles, settings, notifications)
│   ├── consumers.py     # WebSocket consumers (chat, notifications, spheres)
│   └── signals.py       # Auto-create Profile and UserSettings on registration
├── blog/                # Content management
│   ├── models.py        # Post, Comment, Community, Livestream, SphereRoom, SphereParticipant, SphereJoinRequest
│   ├── api.py           # Posts, comments, communities, livestreaming API
│   ├── consumers.py     # Livestream WebSocket consumer
│   └── routing.py       # WebSocket URL routing
├── payments/            # Paystack integration
│   └── api.py           # Payment flows, subscriptions, webhooks
└── frontend/            # React application
    ├── src/
    │   ├── components/       # UI components (Chat, Navbar, PostCard, etc.)
    │   ├── components/settings/ # Settings page sections (profile, privacy, security, etc.)
    │   ├── pages/            # Page components (Home, Explore, Settings, etc.)
    │   ├── hooks/            # Custom hooks (chat WS, livestream WS, notifications WS)
    │   ├── ThemeContext.tsx   # Theme provider (light, dark, system)
    │   ├── AuthContext.tsx    # Auth provider
    │   └── api.ts            # API client
    └── index.html
```

---

## Achievements System

The platform includes a gamification layer with automatic achievement detection:

```mermaid
flowchart LR
    A[User Action] --> B{Check Conditions}
    B -->|Post Created| C[first_post / rising_star]
    B -->|Received Likes| D[karma_king]
    B -->|Daily Login| E[week_warrior]
    B -->|Joined Community| F[community_builder]
    B -->|Gained Followers| G[social_butterfly]
    
    C --> H[Award Achievement]
    D --> H
    E --> H
    F --> H
    G --> H
    
    H --> I[Notify User]
```

### Available Achievements

| Achievement | Trigger | Badge |
|-------------|---------|-------|
| First Post | Publish 1 post | First Post |
| Rising Star | Publish 10 posts | Rising Star |
| Karma King | Reach 100 karma | Karma King |
| Week Warrior | 7-day activity streak | Week Warrior |
| Community Builder | Join 5 communities | Community Builder |
| Social Butterfly | Reach 50 followers | Social Butterfly |

### API Endpoints

```bash
# Get pending (unshown) achievements
GET /api/achievements/pending/

# Mark achievement as shown
POST /api/achievements/mark-shown/
{"achievement_id": "week_warrior"}

# Get all earned achievements
GET /api/achievements/
```

---

## Real-time Chat

```mermaid
sequenceDiagram
    participant U1 as User A
    participant WS as WebSocket Server
    participant U2 as User B
    
    U1->>WS: Connect /ws/chat/
    U2->>WS: Connect /ws/chat/
    U1->>WS: send_message {to: "userB", content: "Hey!"}
    WS->>U2: new_message {from: "userA", content: "Hey!"}
    U2->>WS: mark_read {message_id: "123"}
    WS->>U1: messages_read {ids: ["123"]}
```

---

## Live Streaming Architecture

```mermaid
sequenceDiagram
    participant Host as Host (Browser)
    participant WS as WebSocket Server
    participant API as REST API
    participant Viewer as Viewer (Browser)

    Host->>API: POST /streams/ (title, category)
    API-->>Host: Stream created (scheduled)
    Host->>API: POST /streams/{id}/go_live/
    API-->>Host: Stream is live

    Host->>WS: Connect /ws/livestream/{id}/
    Viewer->>WS: Connect /ws/livestream/{id}/
    WS-->>Host: viewer_joined {user}
    WS-->>Viewer: viewer_joined {user}

    Viewer->>WS: chat_message {content}
    WS-->>Host: chat_message {message}
    WS-->>Viewer: chat_message {message}

    Viewer->>WS: like
    WS-->>Host: like_sent {total_likes}
    WS-->>Viewer: like_sent {total_likes}

    Host->>WS: ban_user {user_id}
    WS-->>Viewer: user_banned {user_id}

    Host->>API: POST /streams/{id}/end_stream/
    WS-->>Viewer: stream_ended
    Note over Host: Summary modal shown
    Host->>API: POST /posts/ (recording) or discard
```

---

## Spheres (Audio Spaces) Architecture

Spheres are live audio rooms tied to communities. They use **LiveKit SFU** for audio transport and **Django Channels** for real-time orb physics, emote bursts, and moderation events.

### Roles

| Role | Permissions |
|------|-------------|
| **Conductor** | Create/end sphere, approve join requests, mute speakers, remove users, lock room |
| **Speaker** | Publish audio, send emotes |
| **Listener** | Listen, raise hand, send emotes |

### Creation & Join Flow

```mermaid
sequenceDiagram
    participant Admin as Conductor (Admin/Mod)
    participant API as REST API
    participant Members as Community Members
    participant Guest as Non-Member

    Admin->>API: POST /api/spheres/{slug}/create/
    API-->>Admin: Room created, conductor role assigned
    API-->>Members: Notification: "Sphere opened in {community}"

    Members->>API: POST /api/spheres/{slug}/join/
    API-->>Members: LiveKit token (listener role)

    Guest->>API: POST /api/spheres/{slug}/request-join/
    API-->>Guest: Request pending
    API-->>Admin: Request appears in conductor panel
    Admin->>API: POST /api/spheres/{slug}/approve/
    API-->>Guest: Now a community member, can join

    Admin->>API: POST /api/spheres/{slug}/end/
    API-->>Members: Sphere ended
```

### Sphere API Endpoints

```bash
# Sphere lifecycle
GET  /api/spheres/{slug}/status/       # Public — is_live, participant_count, conductor info
POST /api/spheres/{slug}/create/       # Admin/mod — create sphere, notify all members
POST /api/spheres/{slug}/join/         # Member — get LiveKit token
POST /api/spheres/{slug}/leave/        # Participant — leave sphere (auto-ends if empty)
POST /api/spheres/{slug}/end/          # Conductor — force end sphere for everyone

# Guest approval
POST /api/spheres/{slug}/request-join/ # Non-member — request access
GET  /api/spheres/{slug}/requests/     # Conductor — list pending requests
POST /api/spheres/{slug}/approve/      # Conductor — approve (auto-creates membership)
POST /api/spheres/{slug}/deny/         # Conductor — deny request

# In-room controls
POST /api/spheres/{slug}/hand-raise/   # Listener — raise/lower hand
POST /api/spheres/{slug}/promote/      # Conductor — promote listener to speaker
POST /api/spheres/{slug}/demote/       # Conductor — demote speaker to listener
GET  /api/spheres/{slug}/participants/ # List active participants

# WebSocket
WS   /ws/spheres/{slug}/              # Orb physics, emote bursts, moderation events
```

---

## Quick Start

### Option 1: Docker (Recommended)

The easiest way to run the full stack locally.

**Run Everything in Docker:**
```bash
# Development mode (with backend hot-reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Production mode (full simulation)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Mixed Mode (Best for Development):**
*Run backend in Docker + frontend locally for fastest React hot-reloading.*

1. **Terminal 1 (Backend):**
   ```bash
   docker compose up --build
   ```
2. **Terminal 2 (Frontend):**
   ```bash
   cd frontend
   npm run dev
   ```

**Services:**
| Service | Dev URL | Local Port | Host Port | Description |
|---------|---------|------------|-----------|-------------|
| Frontend | http://localhost:5173 | 5173 | 5173 | React + Vite (Mixed Mode) |
| Frontend | http://localhost | 80 | 80 | Nginx Production Build |
| Backend | http://localhost:8000 | 8000 | 8000 | Django REST API (Gunicorn) |
| Database | localhost:5432 | 5432 | 5433 | PostgreSQL |
| Redis | localhost:6379 | 6379 | 6380 | Caching & WebSockets |

### Option 2: Manual Setup

#### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL (optional, SQLite default)
- Redis (optional, for WebSocket scaling)

#### Backend Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/macOS
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Create admin user
python manage.py createsuperuser

# Start server
python manage.py runserver
```

#### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

**Access:**
- Frontend: http://localhost:5173
- Backend API: http://127.0.0.1:8000/api/
- API Docs: http://127.0.0.1:8000/api/docs/

---

## API Documentation

The Spherespace API includes interactive documentation powered by **OpenAPI/Swagger**.

| URL | Description |
|-----|-------------|
| `/api/docs/` | **Swagger UI** — Interactive API documentation |
| `/api/redoc/` | **ReDoc** — Alternative documentation view |
| `/api/schema/` | Raw OpenAPI JSON schema |
| `/api/` | DRF Browsable API |

### Using the API Docs

1. **Explore endpoints** — Browse all available API routes organized by category
2. **Try it out** — Test endpoints directly in the browser
3. **View schemas** — See request/response formats for each endpoint
4. **Authentication** — Use the "Authorize" button to add session credentials

### Key API Endpoints

```bash
# Authentication
POST /api/auth/login/
POST /api/auth/register/
POST /api/auth/logout/
GET  /api/auth/user/
POST /api/auth/password/change/
POST /api/auth/password/reset/
POST /api/auth/password/reset/confirm/
POST /api/auth/delete-account/

# Email Verification
POST /api/auth/verify-email/
POST /api/auth/resend-verification/

# User Settings
GET   /api/settings/              # Get notification, privacy, and appearance prefs
PATCH /api/settings/              # Update settings

# Notifications
GET  /api/notifications/
POST /api/notifications/mark-read/

# Posts and Content
GET  /api/posts/
POST /api/posts/
GET  /api/posts/{slug}/

# Communities
GET  /api/communities/
POST /api/communities/{slug}/join/

# Messaging
GET  /api/conversations/
POST /api/conversations/{id}/messages/

# Achievements
GET  /api/achievements/
GET  /api/achievements/pending/

# Livestreams
GET  /api/streams/
POST /api/streams/              # Create stream (with category)
POST /api/streams/{id}/go_live/ # Start broadcasting
POST /api/streams/{id}/end_stream/
DELETE /api/streams/{id}/delete_stream/
GET  /api/streams/{id}/messages/ # Chat history
POST /api/streams/{id}/like/
POST /api/streams/{id}/ban_user/ # Host moderation

# Payments
POST /api/payments/initialize/
GET  /api/payments/verify/{ref}/
GET  /api/payments/subscription/
POST /api/payments/cancel/

# Spheres (Audio Spaces)
GET  /api/spheres/{slug}/status/       # Check if sphere is live
POST /api/spheres/{slug}/create/       # Start a sphere (admin/mod)
POST /api/spheres/{slug}/join/         # Join sphere (get LiveKit token)
POST /api/spheres/{slug}/leave/        # Leave sphere
POST /api/spheres/{slug}/end/          # End sphere (conductor)
POST /api/spheres/{slug}/request-join/ # Request to join (non-member)
POST /api/spheres/{slug}/approve/      # Approve join request (conductor)

# WebSocket Endpoints
WS   /ws/chat/                   # Real-time messaging, typing, read receipts
WS   /ws/notifications/          # Real-time notification delivery
WS   /ws/livestream/{id}/        # Stream chat, likes, viewer tracking
WS   /ws/spheres/{room}/         # Audio spaces
```

## Environment Variables

Create a `.env` file in the project root:

```env
# Django
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=True
DJANGO_ENV=development
SITE_NAME=Spherespace
SITE_DOMAIN=your-domain.com

# Database (optional, defaults to SQLite)
DATABASE_URL=postgres://user:pass@localhost:5432/spherespace

# Redis (for production)
REDIS_URL=redis://127.0.0.1:6379

# AWS S3 (for media storage)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_STORAGE_BUCKET_NAME=

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Payments
PAYSTACK_SECRET_KEY=sk_test_xxx
PAYSTACK_PUBLIC_KEY=pk_test_xxx

# Email (Gmail SMTP with App Password)
EMAIL_HOST_USER=your@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
DEFAULT_FROM_EMAIL=your@gmail.com

# Admin access
ADMIN_IP_RESTRICT=True
ADMIN_ALLOWED_IPS=127.0.0.1,::1
```

---

## Admin Access Control

Admin access is restricted by an IP allowlist. Update `ADMIN_ALLOWED_IPS` with Tailscale or trusted IPs. You can disable the restriction by setting `ADMIN_IP_RESTRICT=False`.

## Scalability

| Component | Current | At Scale (1M+ users) |
|-----------|---------|----------------------|
| Database | SQLite / PostgreSQL | PostgreSQL + Read Replicas |
| Caching | None | Redis |
| Channel Layer | In-Memory | Redis |
| Media Storage | Local / Cloudinary | AWS S3 + CloudFront CDN |
| Task Queue | Sync | Celery + Redis |

### Production Recommendations

```python
# settings.py - Production caching
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.environ.get('REDIS_URL'),
    }
}

# Channel layers with Redis
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [os.environ.get('REDIS_URL')],
        },
    },
}
```

---

## UI Features

### Settings Page
A comprehensive, standalone settings page with sidebar navigation (desktop) and tab bar (mobile):
- **Profile** — Avatar upload, display name, bio
- **Account** — Email management, verification status
- **Appearance** — Light, dark, and system theme picker
- **Notifications** — Per-type toggles (likes, comments, follows, replies) and email notifications
- **Privacy** — Profile visibility, online status, messaging permissions
- **Security** — Inline password change
- **Danger Zone** — Account deletion with password confirmation

### Chat Drawer
- Slide-in drawer with animated open/close transitions
- Message requests for non-followers
- Graceful handling of legacy encrypted messages

### Micro-interactions
- **Like button**: Heartbeat animation on click
- **Save button**: Pop bounce animation
- **Emoji reactions**: Colored tint + label display

### Skeleton Loading
Shimmer loading states across all pages for a polished experience.

### Theme Support
- Dark mode
- Light mode
- System preference detection (with live media query listener)

### Live Streaming
- Real-time WebSocket chat (replaces REST polling) with auto-reconnect
- Stream categories (Gaming, Music, Coding, Art, Cooking, Chat, Education, Other) with color-coded chips
- Post-stream choice: save recording as a post or discard after ending
- Stream summary modal with stats (duration, peak viewers, likes, messages)
- Screen sharing for hosts (desktop only, via `getDisplayMedia` + `replaceTrack`)
- Viewer list panel with host moderation (ban users from chat)
- Premium transparent overlays for stream controls
- Confirmation dialogs for critical actions (end stream, delete)

### Audio Spaces (Spheres)
- **Conductor role** — renamed from "host" to match the cosmic theme
- **Smart sphere button** on community pages — context-aware: Start (admin/mod), Join (member), Request to Join (guest)
- **Creation modal** — title input with auto-notify to all community members
- **Guest approval flow** — non-members request access, conductor approves/denies from inside the room
- **End sphere** — conductor can force-end for all participants from the dock
- **Pulsing live indicator** — animated green dot when a sphere is active
- **Request panel** — glass-morphism dropdown for conductor with pending count badge

## Roadmap

- [x] Sphere creation flow with conductor role
- [x] Guest request-to-join approval system
- [x] Sphere lifecycle management (create, join, leave, end)
- [ ] Push notifications
- [ ] Voice/video calling
- [ ] Stories feature
- [ ] AI content recommendations
- [ ] Creator monetization tools
- [ ] Mobile apps (React Native)

---

## CI/CD and DevOps

This project uses **GitHub Actions** for robust automated testing and deployment.

### Workflows
| Workflow | Trigger | Description |
|----------|---------|-------------|
| **CI Pipeline** | `push`, `pull_request` | Runs backend tests (pytest), frontend tests, lints, and builds Docker images. |
| **CodeQL Security** | `push`, `schedule` | Advanced security scanning for Python and Javascript vulnerabilities. |
| **Release** | `tag` (v*) | Automatically builds production Docker images, pushes to DockerHub, and creates a GitHub Release. |
| **Dependabot** | `daily` | Automatically checks and creates PRs for outdated pip and npm dependencies. |

### Docker Architecture
* **Multi-stage builds** for optimized image sizes (Backend < 200MB).
* **Non-root users** for security.
* **Health checks** enabled for all services.
* **Docker Compose Watch** configured for backend hot-reloading in dev.

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## License

This project is licensed under the MIT License.

---

## Additional Documentation

See the `docs/` folder for:
- `architecture.svg` — System architecture diagram
- `websocket-sequence.svg` — WebSocket message flow
- `api.md` — REST & WebSocket API examples

