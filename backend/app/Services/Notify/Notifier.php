<?php

namespace App\Services\Notify;

use App\Jobs\SendNotificationEmail;
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
    public function __construct(private NotifySettings $settings, private ChannelResolver $resolver, private Recipients $recipients) {}

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
                $this->prepareWhatsApp($bell, $r['bell'] ?? $to, $type, (string) $r['person']['whatsapp'], $message);
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

    /** A WhatsApp message waiting for a person to send it (a wa.me link); automatic sending comes with the WhatsApp API. */
    private function prepareWhatsApp(?Notification $bell, ?Model $to, string $type, string $number, string $body): NotificationDelivery
    {
        $digits = CompanyProfile::waDigits($number);
        $text = $body . ' — ' . CompanyProfile::name();
        $d = $this->record($bell, $to, $type, 'whatsapp', $digits ? 'to_send' : 'skipped', $digits ? '+' . $digits : $number, null, $text, $digits ? null : 'no_number');
        if ($digits) {
            $d->forceFill(['via' => 'link', 'wa_url' => 'https://wa.me/' . $digits . '?text=' . rawurlencode($text)])->save();
        }

        return $d;
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
}
