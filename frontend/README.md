# Spherespace

A modern social platform for communities and conversations. Built with Django, Django REST Framework, Django Channels, and a React + TypeScript frontend.

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Features](#features)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Docker](#docker)
- [API Documentation](#api-documentation)
- [Running Tests](#running-tests)
- [Deployment](#deployment)

---

## Overview

Spherespace is a full-stack social platform that combines microblogging, real-time chat, livestreaming, community spaces, and audio rooms into a single product. The backend is a Django ASGI application serving both REST APIs and WebSocket connections. The frontend is a React single-page application built with Vite.

---

## Tech Stack

### Backend

| Component | Technology |
|-----------|-----------|
| Framework | Django 5.1, Django REST Framework |
| ASGI / WebSockets | Daphne, Django Channels |
| Database | PostgreSQL (production), SQLite (development) |
| Task Queue | Celery with Redis broker |
| Object Storage | AWS S3, Cloudinary |
| Static Files | WhiteNoise |
| Auth | Django Allauth (Google, GitHub OAuth), session-based API auth |
| Payments | Paystack |
| API Docs | drf-spectacular (Swagger / ReDoc) |

### Frontend

| Component | Technology |
|-----------|-----------|
| Framework | React 19 with TypeScript |
| Build Tool | Vite 7 |
| Styling | Tailwind CSS 4 |
| Routing | React Router DOM 7 |
| Data Fetching | TanStack React Query |
| HTTP Client | Axios |

---

## Project Structure

```
my_project/
  blog/             # Posts, comments, communities, livestreaming
  users/            # Auth, profiles, follows, chat, notifications, settings
  payments/         # Paystack subscriptions and payment processing
  my_project/       # Django settings, ASGI config, URL routing, middleware
  frontend/         # React SPA (Vite + TypeScript + Tailwind)
  templates/        # Django templates (email, admin)
  staticfiles/      # Collected static files
  Dockerfile        # Production Docker image
  Dockerfile.dev    # Development Docker image
  docker-compose.yml
  docker-compose.dev.yml
  docker-compose.prod.yml
  requirements.txt
  .env              # Environment configuration (not committed)
```

---

## Features

### Social Blogging
- Create, edit, and delete posts with images and video
- Threaded comment system with nested replies
- Like/dislike system for posts and comments
- Trending algorithm (Wilson Lower Bound + time decay)
- View counting and engagement metrics

### Communities
- Create and manage communities with privacy controls
- Roles: member, moderator, admin
- Community-scoped post feeds
- Join/leave functionality

### Real-Time Chat
- Direct messaging with WebSocket delivery
- Typing indicators and read receipts
- Message requests for non-followers
- Image, voice, and post sharing
- Unsend/soft-delete messages

### Livestreaming
- WebRTC-based live video streaming
- Real-time chat overlay via WebSocket
- Viewer tracking and peak viewer counts
- Stream categories, likes, and moderation (bans)

### Spheres (Audio Rooms)
- Real-time audio spaces with synchronized presence
- Orb position syncing with physics simulation
- Emote reactions

### User System
- Registration with email verification
- Google and GitHub OAuth sign-in
- Follow/unfollow relationships
- Profile customization (avatar, bio)
- Daily activity streaks and achievements (gamification)
- Notification system (in-app + email, configurable per type)
- Settings page (profile, account, appearance, notifications, privacy, security)
- Theme support: light, dark, system

### Payments
- Paystack integration for subscriptions
- Tiers: Blue, Premium, Organization
- Monthly and annual billing with discounts
- Webhook-driven payment verification
- Payment history and receipt emails

### Infrastructure
- ASGI server with WebSocket support via Channels
- Background task processing with Celery + Redis
- S3 / Cloudinary media storage
- Docker support for development and production
- CORS and CSRF protection
- Rate limiting on auth endpoints
- Request logging middleware
- Admin IP allowlisting

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL (or SQLite for development)
- Redis (for Channels and Celery)

### Backend Setup

```bash
cd my_project

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment variables
cp .env.example .env  # edit .env with your values

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start the development server
daphne -b 0.0.0.0 -p 8000 my_project.asgi:application
```

### Frontend Setup

```bash
cd my_project/frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the Django backend on port 8000.

---

## Environment Variables

Create a `.env` file in the project root. Required variables:

| Variable | Description |
|----------|-------------|
| `DJANGO_ENV` | `development` or `production` |
| `DJANGO_SECRET_KEY` | Django secret key |
| `DJANGO_DEBUG` | `True` or `False` |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts |
| `SITE_DOMAIN` | Production domain (e.g. `example.com`) |
| `SITE_NAME` | Display name (defaults to `Spherespace`) |
| `DATABASE_URL` | PostgreSQL connection string (production) |
| `REDIS_URL` | Redis connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |
| `AWS_ACCESS_KEY_ID` | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key |
| `AWS_STORAGE_BUCKET_NAME` | S3 bucket name |
| `AWS_S3_REGION_NAME` | S3 region |
| `PAYSTACK_SECRET_KEY` | Paystack secret key |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key |
| `EMAIL_HOST_USER` | SMTP sender email (Gmail) |
| `EMAIL_HOST_PASSWORD` | SMTP app password |
| `DEFAULT_FROM_EMAIL` | Default "From" address |

---

## Docker

### Development

```bash
docker-compose -f docker-compose.dev.yml up --build
```

### Production

```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

---

## API Documentation

Interactive API docs are available when the server is running:

- **Swagger UI**: `/api/docs/`
- **ReDoc**: `/api/redoc/`
- **OpenAPI Schema**: `/api/schema/`

---

## Running Tests

```bash
# Backend tests
python manage.py test

# Or with pytest
pytest
```

---

## Deployment

The project is configured for deployment on Render with:

- Daphne as the ASGI server
- PostgreSQL as the database
- Redis for Channels and Celery
- S3 or Cloudinary for media storage
- WhiteNoise for static file serving
- HTTPS enforced via `SECURE_SSL_REDIRECT` and HSTS headers

Set `DJANGO_ENV=production` and configure all required environment variables on your hosting provider.

---

## License

All rights reserved.
