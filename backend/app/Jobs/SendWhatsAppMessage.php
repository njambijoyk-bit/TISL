<?php

namespace App\Jobs;

use App\Models\NotificationDelivery;
use App\Services\Notify\Notifier;
use App\Services\Notify\WhatsApp\WhatsAppProviders;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Sends one WhatsApp delivery through the chosen API. Three tries; if it still can not be sent, or the provider reports it failed, the message is not lost: it
 * moves to the "WhatsApp to send" list with a wa.me link for a person to send by hand (Notifier::fallBackToHand).
 */
class SendWhatsAppMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public int $deliveryId)
    {
    }

    public function backoff(): array
    {
        return [30, 180];
    }

    public function handle(WhatsAppProviders $providers): void
    {
        $d = NotificationDelivery::find($this->deliveryId);
        if (! $d || $d->status !== 'queued') {
            return;   // gone, handled, or already sent: never send twice
        }
        $p = $d->payload ?? [];
        $provider = $providers->make();
        if (! $provider || ! $provider->configured() || $provider->key() !== ($p['provider'] ?? $provider->key())) {
            throw new \RuntimeException('WhatsApp sending is not set up (or the provider changed).');
        }
        $d->increment('attempts');
        $r = $provider->send(preg_replace('/\D+/', '', (string) $d->to_address), (string) ($p['template'] ?? ''), (string) ($p['language'] ?? 'en'), array_values($p['vars'] ?? []));
        if (! $r['ok']) {
            throw new \RuntimeException($r['error'] ?? 'WhatsApp refused the message.');
        }
        $d->forceFill(['status' => 'sent', 'sent_at' => now(), 'external_id' => $r['id'], 'error' => null])->save();
    }

    public function failed(\Throwable $e): void
    {
        if ($d = NotificationDelivery::find($this->deliveryId)) {
            app(Notifier::class)->fallBackToHand($d, mb_substr(trim(preg_replace('/\s+/', ' ', $e->getMessage())), 0, 400));
        }
    }
}
