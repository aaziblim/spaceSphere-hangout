import hashlib
import hmac
import requests
import uuid
from decimal import Decimal
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import serializers

from .models import Payment, Subscription
from .email_service import send_payment_confirmation_email, send_subscription_cancelled_email


# =============================================================================
# SERIALIZERS
# =============================================================================

class SubscriptionSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(read_only=True)
    tier_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Subscription
        fields = [
            'id', 'tier', 'tier_display', 'status', 'billing_cycle',
            'amount', 'currency', 'started_at', 'expires_at', 
            'cancelled_at', 'is_active'
        ]
    
    def get_tier_display(self, obj):
        return {'basic': 'Blue', 'premium': 'Premium', 'organization': 'Organization'}.get(obj.tier, obj.tier)


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = [
            'id', 'reference', 'amount', 'currency', 'status',
            'payment_method', 'tier', 'billing_cycle', 'created_at', 'verified_at'
        ]


# =============================================================================
# PAYSTACK HELPERS
# =============================================================================

# Paystack test credentials (replace with env vars in production)
PAYSTACK_SECRET_KEY = getattr(settings, 'PAYSTACK_SECRET_KEY', 'sk_test_xxxxxxxxxxxxxxxxxxxxx')
PAYSTACK_PUBLIC_KEY = getattr(settings, 'PAYSTACK_PUBLIC_KEY', 'pk_test_xxxxxxxxxxxxxxxxxxxxx')

# Pricing (in cents/kobo)
TIER_PRICING = {
    'basic': {'monthly': 800, 'annual': 8000},      # $8/mo or $80/year
    'premium': {'monthly': 1600, 'annual': 16000},  # $16/mo or $160/year
    'organization': {'monthly': 20000, 'annual': 200000},  # $200/mo or $2000/year
}


def verify_paystack_signature(request):
    """Verify webhook signature from Paystack."""
    signature = request.headers.get('x-paystack-signature', '')
    computed = hmac.new(
        PAYSTACK_SECRET_KEY.encode('utf-8'),
        request.body,
        hashlib.sha512
    ).hexdigest()
    return hmac.compare_digest(signature, computed)


def verify_transaction_with_paystack(reference):
    """
    Verify a transaction with Paystack API.
    Returns (success, data) tuple.
    """
    url = f"https://api.paystack.co/transaction/verify/{reference}"
    headers = {
        "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        data = response.json()
        
        if data.get('status') and data.get('data', {}).get('status') == 'success':
            return True, data['data']
        return False, data
    except Exception as e:
        return False, {'error': str(e)}


# =============================================================================
# API ENDPOINTS
# =============================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def initialize_payment(request):
    """
    Initialize a payment and return reference for frontend.
    
    Request body:
    {
        "tier": "basic" | "premium" | "organization",
        "billing_cycle": "monthly" | "annual",
        "payment_method": "card" | "mobile_money",
        "phone_number": "0551234987",  // Required for mobile_money
        "momo_provider": "mtn" | "vod" | "tgo"  // Required for mobile_money
    }
    """
    user = request.user
    tier = request.data.get('tier', 'premium')
    billing_cycle = request.data.get('billing_cycle', 'monthly')
    payment_method = request.data.get('payment_method', 'card')
    phone_number = request.data.get('phone_number')
    momo_provider = request.data.get('momo_provider', 'mtn')
    
    # Validate tier
    if tier not in TIER_PRICING:
        return Response({'error': 'Invalid tier'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Validate mobile money params
    if payment_method == 'mobile_money' and not phone_number:
        return Response({'error': 'Phone number required for mobile money'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Calculate amount
    amount = TIER_PRICING[tier][billing_cycle]
    currency = 'GHS' if payment_method == 'mobile_money' else 'USD'
    
    # Generate unique reference using UUID to prevent duplicates
    short_uuid = uuid.uuid4().hex[:8]
    reference = f"VRF_{int(timezone.now().timestamp())}_{user.id}_{short_uuid}"
    
    # Create payment record
    payment = Payment.objects.create(
        user=user,
        reference=reference,
        amount=Decimal(amount) / 100,  # Store in dollars/cedis
        currency=currency,
        payment_method=payment_method,
        tier=tier,
        billing_cycle=billing_cycle,
        phone_number=phone_number if payment_method == 'mobile_money' else None,
        momo_provider=momo_provider if payment_method == 'mobile_money' else None,
        metadata={
            'username': user.username,
            'email': user.email,
        }
    )
    
    return Response({
        'reference': reference,
        'amount': amount,  # In cents/kobo for Paystack
        'currency': currency,
        'email': user.email,
        'tier': tier,
        'billing_cycle': billing_cycle,
        'payment_method': payment_method,
        'phone_number': phone_number,
        'momo_provider': momo_provider,
        'public_key': PAYSTACK_PUBLIC_KEY,
    })


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def verify_payment(request, reference):
    """
    Verify a payment and activate subscription.
    Called by frontend after successful Paystack callback.
    """
    user = request.user
    
    try:
        payment = Payment.objects.get(reference=reference, user=user)
    except Payment.DoesNotExist:
        return Response({'error': 'Payment not found'}, status=status.HTTP_404_NOT_FOUND)
    
    if payment.status == 'success':
        # Already verified
        serializer = PaymentSerializer(payment)
        return Response({
            'status': 'success',
            'message': 'Payment already verified',
            'payment': serializer.data
        })
    
    # Verify with Paystack in production by default
    if getattr(settings, 'PAYSTACK_VERIFY', not settings.DEBUG):
        success, paystack_data = verify_transaction_with_paystack(reference)
        if not success:
            return Response({'error': 'Payment verification failed', 'details': paystack_data}, status=status.HTTP_400_BAD_REQUEST)
        paystack_reference = paystack_data.get('id') or paystack_data.get('reference') or reference
    else:
        # For demo/testing: automatically mark as success
        paystack_reference = request.data.get('paystack_reference', f'PS_{reference}')
    
    # Mark payment as successful
    payment.mark_success(paystack_reference)
    
    # Create or update subscription
    expires_at = timezone.now() + timedelta(
        days=365 if payment.billing_cycle == 'annual' else 30
    )
    
    subscription, created = Subscription.objects.update_or_create(
        user=user,
        defaults={
            'tier': payment.tier,
            'status': 'active',
            'billing_cycle': payment.billing_cycle,
            'amount': payment.amount,
            'currency': payment.currency,
            'expires_at': expires_at,
            'cancelled_at': None,
        }
    )
    
    payment.subscription = subscription
    payment.save(update_fields=['subscription'])
    
    # Send confirmation email
    send_payment_confirmation_email(user, payment)
    
    return Response({
        'status': 'success',
        'message': 'Payment verified and subscription activated',
        'payment': PaymentSerializer(payment).data,
        'subscription': SubscriptionSerializer(subscription).data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_subscription(request):
    """Get current user's subscription status."""
    user = request.user
    
    try:
        subscription = Subscription.objects.get(user=user)
        return Response({
            'has_subscription': True,
            'subscription': SubscriptionSerializer(subscription).data,
        })
    except Subscription.DoesNotExist:
        return Response({
            'has_subscription': False,
            'subscription': None,
        })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_subscription(request):
    """
    Cancel the current user's subscription.
    Subscription remains active until expires_at.
    """
    user = request.user
    
    try:
        subscription = Subscription.objects.get(user=user)
    except Subscription.DoesNotExist:
        return Response({'error': 'No subscription found'}, status=status.HTTP_404_NOT_FOUND)
    
    if subscription.status == 'cancelled':
        return Response({'error': 'Subscription already cancelled'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Cancel the subscription
    subscription.cancel()
    
    # Send cancellation email
    send_subscription_cancelled_email(user, subscription)
    
    return Response({
        'status': 'success',
        'message': f'Subscription cancelled. Access remains until {subscription.expires_at.strftime("%B %d, %Y")}',
        'subscription': SubscriptionSerializer(subscription).data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def payment_history(request):
    """Get user's payment history."""
    user = request.user
    payments = Payment.objects.filter(user=user).order_by('-created_at')[:20]
    return Response({
        'payments': PaymentSerializer(payments, many=True).data,
    })


# =============================================================================
# PAYSTACK WEBHOOK
# =============================================================================

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def paystack_webhook(request):
    """
    Handle Paystack webhook events.
    
    Events handled:
    - charge.success: Payment successful
    - subscription.create: Subscription created
    - subscription.disable: Subscription cancelled
    """
    # Verify signature (enabled by default in production)
    if getattr(settings, 'PAYSTACK_WEBHOOK_VERIFY', not settings.DEBUG):
        if not verify_paystack_signature(request):
            return HttpResponse(status=400)
    
    try:
        event = request.data.get('event')
        data = request.data.get('data', {})
        
        if event == 'charge.success':
            reference = data.get('reference')
            if reference:
                try:
                    payment = Payment.objects.get(reference=reference)
                    if payment.status != 'success':
                        payment.mark_success(data.get('id'))
                        
                        # Create/update subscription
                        expires_at = timezone.now() + timedelta(
                            days=365 if payment.billing_cycle == 'annual' else 30
                        )
                        
                        subscription, _ = Subscription.objects.update_or_create(
                            user=payment.user,
                            defaults={
                                'tier': payment.tier,
                                'status': 'active',
                                'billing_cycle': payment.billing_cycle,
                                'amount': payment.amount,
                                'currency': payment.currency,
                                'expires_at': expires_at,
                            }
                        )
                        
                        payment.subscription = subscription
                        payment.save(update_fields=['subscription'])
                        
                        # Send email
                        send_payment_confirmation_email(payment.user, payment)
                        
                except Payment.DoesNotExist:
                    pass
        
        return HttpResponse(status=200)
        
    except Exception as e:
        print(f"Webhook error: {e}")
        return HttpResponse(status=500)
