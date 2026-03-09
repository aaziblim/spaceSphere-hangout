from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.contrib.auth.tokens import default_token_generator
from users.tokens import make_email_verification_token


def get_frontend_url():
    """Build the frontend base URL from settings."""
    if settings.ENVIRONMENT != 'production':
        return 'http://localhost:5173'
    return f'https://{settings.SITE_DOMAIN}'


def send_verification_email(user):
    """Send email verification link after registration."""
    token = make_email_verification_token(user)
    verify_url = f"{get_frontend_url()}/verify-email/{token}"

    context = {
        'username': user.username,
        'verify_url': verify_url,
        'site_name': settings.SITE_NAME,
        'expiry_days': 3,
    }

    subject = f"Verify your email - {settings.SITE_NAME}"
    text_body = render_to_string('users/emails/verify_email.txt', context)
    html_body = render_to_string('users/emails/verify_email.html', context)

    send_mail(
        subject=subject,
        message=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        html_message=html_body,
        fail_silently=False,
    )


def send_password_reset_email(user):
    """Send password reset link."""
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    reset_url = f"{get_frontend_url()}/forgot-password/{uid}/{token}"

    context = {
        'username': user.username,
        'reset_url': reset_url,
        'site_name': settings.SITE_NAME,
        'expiry_hours': 24,
    }

    subject = f"Reset your password - {settings.SITE_NAME}"
    text_body = render_to_string('users/emails/password_reset.txt', context)
    html_body = render_to_string('users/emails/password_reset.html', context)

    send_mail(
        subject=subject,
        message=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        html_message=html_body,
        fail_silently=False,
    )
