<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'notifiable_type',
        'notifiable_id',
        'type',
        'title',
        'message',
        'icon',
        'color',
        'action_url',
        'action_text',
        'data',
        'channels',
        'read_at',
        'sent_at',
        'email_sent_at',
        'sms_sent_at',
        'push_sent_at',
        'priority',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'data' => 'array',
        'channels' => 'array',
        'read_at' => 'datetime',
        'sent_at' => 'datetime',
        'email_sent_at' => 'datetime',
        'sms_sent_at' => 'datetime',
        'push_sent_at' => 'datetime',
    ];

    /**
     * Append custom attributes.
     */
    protected $appends = [
        'is_read',
        'is_unread',
        'time_ago',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the owning notifiable model (User or Customer).
     */
    public function notifiable()
    {
        return $this->morphTo();
    }

    // ========================================
    // ACCESSORS (Computed Properties)
    // ========================================

    /**
     * Check if notification is read.
     */
    public function getIsReadAttribute(): bool
    {
        return !is_null($this->read_at);
    }

    /**
     * Check if notification is unread.
     */
    public function getIsUnreadAttribute(): bool
    {
        return is_null($this->read_at);
    }

    /**
     * Get human-readable time ago.
     */
    public function getTimeAgoAttribute(): string
    {
        return $this->created_at->diffForHumans();
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get notifications for a specific user/customer.
     */
    public function scopeForNotifiable($query, $notifiable)
    {
        return $query->where('notifiable_type', get_class($notifiable))
                     ->where('notifiable_id', $notifiable->id);
    }

    /**
     * Scope to get read notifications.
     */
    public function scopeRead($query)
    {
        return $query->whereNotNull('read_at');
    }

    /**
     * Scope to get unread notifications.
     */
    public function scopeUnread($query)
    {
        return $query->whereNull('read_at');
    }

    /**
     * Scope to get notifications by type.
     */
    public function scopeByType($query, string $type)
    {
        return $query->where('type', $type);
    }

    /**
     * Scope to get notifications by priority.
     */
    public function scopeByPriority($query, string $priority)
    {
        return $query->where('priority', $priority);
    }

    /**
     * Scope to get high priority notifications.
     */
    public function scopeHighPriority($query)
    {
        return $query->where('priority', 'high');
    }

    /**
     * Scope to get recent notifications.
     */
    public function scopeRecent($query, int $days = 30)
    {
        return $query->where('created_at', '>=', now()->subDays($days));
    }

    /**
     * Scope to get sent notifications.
     */
    public function scopeSent($query)
    {
        return $query->whereNotNull('sent_at');
    }

    /**
     * Scope to get unsent notifications.
     */
    public function scopeUnsent($query)
    {
        return $query->whereNull('sent_at');
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Mark notification as read.
     */
    public function markAsRead(): void
    {
        if ($this->is_unread) {
            $this->update(['read_at' => now()]);
        }
    }

    /**
     * Mark notification as unread.
     */
    public function markAsUnread(): void
    {
        if ($this->is_read) {
            $this->update(['read_at' => null]);
        }
    }

    /**
     * Mark as sent.
     */
    public function markAsSent(): void
    {
        if (!$this->sent_at) {
            $this->update(['sent_at' => now()]);
        }
    }

    /**
     * Mark email as sent.
     */
    public function markEmailAsSent(): void
    {
        $this->update(['email_sent_at' => now()]);
    }

    /**
     * Mark SMS as sent.
     */
    public function markSmsAsSent(): void
    {
        $this->update(['sms_sent_at' => now()]);
    }

    /**
     * Mark push notification as sent.
     */
    public function markPushAsSent(): void
    {
        $this->update(['push_sent_at' => now()]);
    }

    /**
     * Get notification icon with default.
     */
    public function getIconWithDefault(): string
    {
        if ($this->icon) {
            return $this->icon;
        }
        
        // Default icons based on type
        return match($this->type) {
            'order_placed' => 'shopping-cart',
            'order_confirmed' => 'check-circle',
            'order_shipped' => 'truck',
            'order_delivered' => 'box-check',
            'order_cancelled' => 'times-circle',
            'payment_received' => 'credit-card',
            'quote_received' => 'file-invoice',
            'quote_accepted' => 'handshake',
            'referral_earned' => 'gift',
            'account_created' => 'user-plus',
            'password_reset' => 'key',
            default => 'bell',
        };
    }

    /**
     * Get notification color with default.
     */
    public function getColorWithDefault(): string
    {
        if ($this->color) {
            return $this->color;
        }
        
        // Default colors based on type
        return match($this->type) {
            'order_placed' => 'blue',
            'order_confirmed' => 'green',
            'order_shipped' => 'indigo',
            'order_delivered' => 'green',
            'order_cancelled' => 'red',
            'payment_received' => 'green',
            'quote_received' => 'yellow',
            'quote_accepted' => 'green',
            'referral_earned' => 'purple',
            'account_created' => 'blue',
            'password_reset' => 'yellow',
            default => 'gray',
        };
    }

    /**
     * Check if notification should be sent via channel.
     */
    public function shouldSendVia(string $channel): bool
    {
        if (empty($this->channels)) {
            return false;
        }
        
        return in_array($channel, $this->channels);
    }

    /**
     * Create a notification for a user/customer.
     */
    public static function createFor(
        $notifiable,
        string $type,
        string $title,
        string $message,
        ?string $actionUrl = null,
        ?string $actionText = null,
        ?array $data = null,
        array $channels = ['database'],
        string $priority = 'normal'
    ): self {
        return self::create([
            'notifiable_type' => get_class($notifiable),
            'notifiable_id' => $notifiable->id,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'action_url' => $actionUrl,
            'action_text' => $actionText,
            'data' => $data,
            'channels' => $channels,
            'priority' => $priority,
        ]);
    }

    /**
     * Create order notification.
     */
    public static function orderNotification(
        $notifiable,
        Order $order,
        string $type,
        string $message
    ): self {
        $titles = [
            'order_placed' => 'Order Placed',
            'order_confirmed' => 'Order Confirmed',
            'order_shipped' => 'Order Shipped',
            'order_delivered' => 'Order Delivered',
            'order_cancelled' => 'Order Cancelled',
        ];
        
        return self::createFor(
            notifiable: $notifiable,
            type: $type,
            title: $titles[$type] ?? 'Order Update',
            message: $message,
            actionUrl: route('orders.show', $order),
            actionText: 'View Order',
            data: [
                'order_id' => $order->id,
                'order_number' => $order->order_number,
            ],
            channels: ['database', 'email'],
            priority: 'high'
        );
    }

    /**
     * Create referral notification.
     */
    public static function referralNotification(
        Customer $referrer,
        float $rewardAmount,
        string $rewardType
    ): self {
        return self::createFor(
            notifiable: $referrer->user ?? $referrer,
            type: 'referral_earned',
            title: 'Referral Reward Earned!',
            message: "You've earned {$rewardAmount} {$rewardType} from your referral!",
            actionUrl: null,
            actionText: 'View Referrals',
            data: [
                'reward_amount' => $rewardAmount,
                'reward_type' => $rewardType,
            ],
            channels: ['database', 'email'],
            priority: 'normal'
        );
    }

    /**
     * Mark all notifications as read for a user.
     */
    public static function markAllAsReadFor($notifiable): void
    {
        self::forNotifiable($notifiable)
            ->unread()
            ->update(['read_at' => now()]);
    }

    /**
     * Get unread count for a user.
     */
    public static function unreadCountFor($notifiable): int
    {
        return self::forNotifiable($notifiable)->unread()->count();
    }
}