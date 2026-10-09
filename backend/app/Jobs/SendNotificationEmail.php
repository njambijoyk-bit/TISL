<?php

namespace App\Jobs;

use App\Mail\NotificationMail;
use App\Models\Notification;
use App\Models\NotificationDelivery;
use App\Services\Notify\MailConfigurator;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;

/** Sends one queued email delivery through the mail settings saved on the screen, and records what happened. A failure is kept with its reason and retried; a person can retry it later too. */
class SendNotificationEmail implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public int $deliveryId)
    {
    }

    public function backoff(): array
    {
        return [60, 300];
    }

    public function handle(MailConfigurator $mail): void
    {
        $d = NotificationDelivery::find($this->deliveryId);
        if (! $d || in_array($d->status, ['sent', 'delivered', 'read'], true)) {
            return;   // gone, or already sent: sending twice is worse than not sending
        }
        $mail->apply();
        $d->increment('attempts');
        $n = $d->notification_id ? Notification::find($d->notification_id) : null;
        $message = new NotificationMail((string) $d->subject, (string) $d->body, $n?->action_url, $n?->action_text, $this->greeting($d));
        $pending = Mail::to($d->to_address);
        if ($copy = config('mail.copy_to_address')) {
            $pending->bcc($copy);
        }
        $pending->send($message);
        $d->forceFill(['status' => 'sent', 'sent_at' => now(), 'error' => null])->save();
        $n?->markEmailAsSent();
    }

    private function greeting(NotificationDelivery $d): string
    {
        $name = null;
        if ($d->notifiable_type && $d->notifiable_id && class_exists($d->notifiable_type)) {
            $who = $d->notifiable_type::find($d->notifiable_id);
            $name = trim((string) ($who->first_name ?? $who->name ?? ''));
        }

        return $name ? "Hello {$name}" : 'Hello';
    }

    public function failed(\Throwable $e): void
    {
        NotificationDelivery::where('id', $this->deliveryId)->update(['status' => 'failed', 'error' => mb_substr(trim(preg_replace('/\s+/', ' ', $e->getMessage())), 0, 480), 'updated_at' => now()]);
    }
}
