from celery import shared_task
from .models import Payment, Subscription
from .email_service import send_payment_confirmation_email, send_subscription_cancelled_email


@shared_task
def send_payment_confirmation_email_task(payment_id: int) -> None:
    try:
        payment = Payment.objects.select_related('user').get(id=payment_id)
    except Payment.DoesNotExist:
        return
    send_payment_confirmation_email(payment.user, payment)


@shared_task
def send_subscription_cancelled_email_task(subscription_id: int) -> None:
    try:
        subscription = Subscription.objects.select_related('user').get(id=subscription_id)
    except Subscription.DoesNotExist:
        return
    send_subscription_cancelled_email(subscription.user, subscription)
