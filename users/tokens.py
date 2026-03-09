from django.core.signing import TimestampSigner, BadSignature, SignatureExpired

EMAIL_VERIFICATION_SALT = 'email-verification'
EMAIL_VERIFICATION_MAX_AGE = 60 * 60 * 24 * 3  # 3 days


def make_email_verification_token(user):
    """Create a signed token encoding user pk and email."""
    signer = TimestampSigner(salt=EMAIL_VERIFICATION_SALT)
    return signer.sign(f"{user.pk}:{user.email}")


def verify_email_token(token):
    """
    Validate the token and return (user_pk, email).
    Raises SignatureExpired or BadSignature on failure.
    """
    signer = TimestampSigner(salt=EMAIL_VERIFICATION_SALT)
    value = signer.unsign(token, max_age=EMAIL_VERIFICATION_MAX_AGE)
    pk_str, email = value.rsplit(':', 1)
    return int(pk_str), email
