from django.contrib import admin
from .models import Subscription, Payment


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'tier', 'status', 'billing_cycle', 'amount', 'currency', 'started_at', 'expires_at', 'is_active_display')
    list_filter = ('tier', 'status', 'billing_cycle', 'currency')
    search_fields = ('user__username', 'user__email', 'paystack_subscription_code')
    readonly_fields = ('started_at',)
    autocomplete_fields = ('user',)
    list_per_page = 30

    def is_active_display(self, obj):
        return obj.is_active
    is_active_display.boolean = True
    is_active_display.short_description = 'Active'

    actions = ['cancel_subscriptions']

    @admin.action(description='Cancel selected subscriptions')
    def cancel_subscriptions(self, request, queryset):
        count = 0
        for sub in queryset.filter(status='active'):
            sub.cancel()
            count += 1
        self.message_user(request, f'{count} subscription(s) cancelled.')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('reference', 'user', 'tier', 'amount', 'currency', 'status', 'payment_method', 'email_sent', 'created_at', 'verified_at')
    list_filter = ('status', 'payment_method', 'tier', 'billing_cycle', 'currency', 'email_sent')
    search_fields = ('reference', 'paystack_reference', 'user__username', 'user__email', 'phone_number')
    readonly_fields = ('reference', 'created_at', 'updated_at', 'verified_at')
    autocomplete_fields = ('user', 'subscription')
    date_hierarchy = 'created_at'
    list_per_page = 30

    actions = ['mark_as_failed']

    @admin.action(description='Mark selected payments as failed')
    def mark_as_failed(self, request, queryset):
        count = 0
        for payment in queryset.filter(status='pending'):
            payment.mark_failed()
            count += 1
        self.message_user(request, f'{count} payment(s) marked as failed.')
