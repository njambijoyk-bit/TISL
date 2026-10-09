<?php

namespace App\Services\Notify;

use App\Jobs\SendNotificationEmail;
use App\Jobs\SendWhatsAppMessage;
use App\Services\Notify\WhatsApp\WhatsAppProviders;
use App\Models\CompanyProfile;
use App\Models\Notification;
use App\Models\NotificationDelivery;
use App\Models\NotificationSettingLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * Every message to a person goes through here (docs/NOTIFICATIONS_PLAN.md). Features say what happened and to whom; this decides the channels
 * (ChannelResolver), makes the bell item, queues the email, prepares the WhatsApp message for a person to send by hand, and writes down what became of each.
 * A problem on any channel is recorded and never reaches the caller: telling someone must not undo what just happened.
 */
class Notifier
{
    public function __construct(private NotifySettings $settings, private ChannelResolver $resolver, private Recipients $recipients, private WhatsAppProviders $providers) {}

    /**
     * @param  array{action_url?: ?string, action_text?: ?string, data?: ?array, priority?: string, subject?: ?string, email?: ?string, whatsapp?: ?string, whatsapp_source?: ?string}  $o
     * @return array{notification: ?Notification, channels: string[], skipped: array<string,string>, staff_list: bool}
     */
    public function send(Model $to, string $type, string $title, string $message, array $o = []): array
    {
        try {
            $r = $this->recipients->for($to, array_intersect_key($o, array_flip(['email', 'whatsapp', 'whatsapp_source'])));
            $rule = $this->settings->get('types')['rules'][$type] ?? [];
            $plan = $this->resolver->resolve($this->settings->get('general'), $rule, NotificationTypes::isEssential($type), $r['person']);

            $bell = null;
            if (in_array('database', $plan['channels'], true) && $r['bell']) {
                $bell = Notification::create(['notifiable_type' => get_class($r['bell']), 'notifiable_id' => $r['bell']->id, 'type' => $type, 'title' => $title, 'message' => $message,
                    'action_url' => $o['action_url'] ?? null, 'action_text' => $o['action_text'] ?? null, 'data' => $o['data'] ?? null, 'channels' => $plan['channels'],
                    'priority' => $o['priority'] ?? (NotificationTypes::isEssential($type) ? 'high' : 'normal'), 'sent_at' => now()]);
            }
            $subject = $o['subject'] ?? $title;
            if (in_array('email', $plan['channels'], true)) {
                $this->queueEmail($bell, $r['bell'] ?? $to, $type, (string) $r['person']['email'], $subject, $message);
            }
            if (in_array('whatsapp', $plan['channels'], true)) {
                $this->prepareWhatsApp($bell, $r['bell'] ?? $to, $type, (string) $r['person']['whatsapp'], $message, $title, $o['action_url'] ?? null, $r['person']);
            }
            foreach ($plan['skipped'] as $channel => $why) {
                if (in_array($why, ['no_email', 'no_number', 'number_source'], true)) {   // worth knowing; a channel the company has switched off is not
                    $this->record($bell, $r['bell'] ?? $to, $type, $channel, 'skipped', null, $subject, $message, $why);
                }
            }
            if ($plan['staff_list']) {
                $this->record($bell, $r['bell'] ?? $to, $type, 'email', 'skipped', null, $subject, $message, 'nobody_reachable');
            }

            return ['notification' => $bell, 'channels' => $plan['channels'], 'skipped' => $plan['skipped'], 'staff_list' => $plan['staff_list']];
        } catch (\Throwable $e) {
            report($e);

            return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
        }
    }

    /**
     * A bell row made the old way (Notification::createFor) that names the email channel: send the email too. Company switches and the address are checked; nothing else
     * (the old callers chose their channels themselves).
     */
    public function deliverExisting(Notification $n): void
    {
        try {
            if (! $n->shouldSendVia('email') || ! NotifySettings::ready() || ! ($this->settings->get('general')['email_enabled'] ?? true)) {
                return;
            }
            $rule = $this->settings->get('types')['rules'][$n->type] ?? [];
            if (($rule['enabled'] ?? true) === false || ! in_array('email', $rule['channels'] ?? ['email'], true)) {
                return;
            }
            $who = $n->notifiable;
            $email = $who?->email ?? $who?->customer?->email ?? null;
            if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $this->record($n, $who, $n->type, 'email', 'skipped', null, $n->title, $n->message, 'no_email');

                return;
            }
            $this->queueEmail($n, $who, $n->type, $email, $n->title, $n->message);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function queueEmail(?Notification $bell, ?Model $to, string $type, string $address, string $subject, string $body): NotificationDelivery
    {
        $d = $this->record($bell, $to, $type, 'email', 'queued', $address, $subject, $body);
        SendNotificationEmail::dispatch($d->id);

        return $d;
    }

    /**
     * A WhatsApp message. With the API switched on and an approved template mapped to this type it goes out automatically (queued); otherwise, or if the API
     * fails, it waits in the "WhatsApp to send" list with a wa.me link for a person to send by hand.
     */
    private function prepareWhatsApp(?Notification $bell, ?Model $to, string $type, string $number, string $body, string $title = '', ?string $link = null, array $person = []): NotificationDelivery
    {
        $digits = CompanyProfile::waDigits($number);
        $text = $body . ' — ' . CompanyProfile::name();
        if (! $digits) {
            return $this->record($bell, $to, $type, 'whatsapp', 'skipped', $number, null, $text, 'no_number');
        }
        $rule = $this->settings->get('types')['rules'][$type] ?? [];
        $cfg = $this->settings->get('whatsapp');
        if (! empty($rule['template']) && $this->providers->automatic() && NotificationDelivery::hasPayload()) {
            $vars = $this->variables($rule['variables'] ?? ['name', 'message'], $person, $to, $title, $body, $link);
            $d = $this->record($bell, $to, $type, 'whatsapp', 'queued', '+' . $digits, null, $text);
            $d->forceFill(['via' => 'api', 'payload' => ['provider' => $cfg['provider'], 'template' => $rule['template'], 'language' => $cfg['language'] ?: 'en', 'vars' => $vars]])->save();
            SendWhatsAppMessage::dispatch($d->id);

            return $d;
        }
        $d = $this->record($bell, $to, $type, 'whatsapp', 'to_send', '+' . $digits, null, $text);
        $this->attachLink($d, $digits, $text);

        return $d;
    }

    private function attachLink(NotificationDelivery $d, string $digits, string $text): void
    {
        $d->forceFill(['via' => 'link', 'wa_url' => 'https://wa.me/' . $digits . '?text=' . rawurlencode($text)])->save();
    }

    /** The values for {{1}}, {{2}} ... in the order the type's template expects. WhatsApp does not allow line breaks in a value. @return string[] */
    private function variables(array $keys, array $person, ?Model $to, string $title, string $body, ?string $link): array
    {
        $name = trim((string) ($person['name'] ?? '')) ?: 'there';
        $map = ['name' => $name, 'title' => $title, 'message' => $body, 'company' => CompanyProfile::name(),
            'link' => $link ? (preg_match('#^https?://#i', $link) ? $link : rtrim((string) config('app.frontend_url'), '/') . '/' . ltrim($link, '/')) : ''];

        return array_map(fn ($k) => trim(preg_replace('/\s{2,}|[\r\n\t]+/', ' ', (string) ($map[$k] ?? ''))) ?: '-', $keys);
    }

    /** The API could not send it (or the provider said it failed): leave it for a person, with the link, and say why. */
    public function fallBackToHand(NotificationDelivery $d, string $why): void
    {
        $digits = preg_replace('/\D+/', '', (string) $d->to_address);
        $d->forceFill(['status' => 'to_send', 'error' => 'api_failed: ' . $why])->save();
        if ($digits !== '') {
            $this->attachLink($d, $digits, (string) $d->body);
        }
    }

    /** A callback from the provider about a message we sent: move its status forward (never back), or hand a failure to a person. */
    public function applyStatus(string $externalId, string $status, ?string $error): bool
    {
        $d = NotificationDelivery::where('channel', 'whatsapp')->where('external_id', $externalId)->first();
        if (! $d) {
            return false;
        }
        $rank = ['queued' => 0, 'sent' => 1, 'delivered' => 2, 'read' => 3];
        if ($status === 'failed') {
            if (! in_array($d->status, ['delivered', 'read'], true)) {
                $this->fallBackToHand($d, $error ?: 'the provider could not deliver it');
            }

            return true;
        }
        if (($rank[$status] ?? -1) > ($rank[$d->status] ?? -1)) {
            $d->forceFill(['status' => $status] + ($status === 'delivered' ? ['delivered_at' => now()] : []) + ($status === 'read' ? ['read_at' => now(), 'delivered_at' => $d->delivered_at ?? now()] : []))->save();
        }

        return true;
    }

    private function record(?Notification $bell, ?Model $to, string $type, string $channel, string $status, ?string $address, ?string $subject, ?string $body, ?string $error = null): NotificationDelivery
    {
        return NotificationDelivery::create(['notification_id' => $bell?->id, 'notifiable_type' => $to ? get_class($to) : null, 'notifiable_id' => $to?->id, 'type' => $type, 'channel' => $channel,
            'status' => $status, 'to_address' => $address, 'subject' => $subject ? mb_substr($subject, 0, 255) : null, 'body' => $body, 'error' => $error]);
    }

    /** Try a failed (or stuck) email again, and say who did. */
    public function retry(NotificationDelivery $d, ?User $by): void
    {
        if ($d->channel !== 'email' || ! in_array($d->status, ['failed', 'queued'], true)) {
            throw new NotifyException('Only a failed or waiting email can be tried again.');
        }
        $d->forceFill(['status' => 'queued', 'error' => null, 'handled_by' => $by?->id])->save();
        SendNotificationEmail::dispatch($d->id);
        NotificationSettingLog::write('message_retried', $by, null, null, "Email to {$d->to_address} tried again ({$d->type}).", ['delivery_id' => $d->id]);
    }

    /** A person sent the WhatsApp message by hand (it opened in WhatsApp and they pressed Send): note it, and who. */
    public function markSent(NotificationDelivery $d, ?User $by): void
    {
        $this->assertToSend($d);
        $d->forceFill(['status' => 'sent', 'sent_at' => now(), 'handled_by' => $by?->id])->save();
        NotificationSettingLog::write('whatsapp_marked_sent', $by, null, null, "WhatsApp to {$d->to_address} marked as sent ({$d->type}).", ['delivery_id' => $d->id]);
    }

    /** Nobody will send it (wrong number, no longer needed): leave it, with who decided. */
    public function skip(NotificationDelivery $d, ?User $by, ?string $why = null): void
    {
        $this->assertToSend($d);
        $d->forceFill(['status' => 'skipped', 'error' => 'skipped_by_staff', 'handled_by' => $by?->id])->save();
        NotificationSettingLog::write('whatsapp_skipped', $by, null, null, "WhatsApp to {$d->to_address} skipped ({$d->type})" . ($why ? ": {$why}" : '.'), ['delivery_id' => $d->id]);
    }

    private function assertToSend(NotificationDelivery $d): void
    {
        if ($d->channel !== 'whatsapp' || $d->status !== 'to_send') {
            throw new NotifyException('That message is not waiting to be sent by hand.');
        }
    }
}
