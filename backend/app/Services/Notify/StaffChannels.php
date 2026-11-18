<?php

namespace App\Services\Notify;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * How staff hear about things (docs/PROJECTS_STAGE6_SPEC.md, build 6.4). Per group of notices (NotificationTypes::GROUPS), each staff member
 * chooses bell only, bell and email, or bell and WhatsApp (to the phone on their staff profile). The company sets each group's default and can
 * lock a group (Notifications settings → General → staff_groups). Until anyone chooses anything, every group is "bell and email": exactly as before.
 * The ChannelResolver applies the answer; nothing else in the Notifier changes.
 */
class StaffChannels
{
    public const MODES = ['bell' => 'Bell only', 'email' => 'Bell and email', 'whatsapp' => 'Bell and WhatsApp'];

    public function __construct(private NotifySettings $settings) {}

    /** Has script 262 been run? */
    public static function ready(): bool
    {
        return app()->runningUnitTests() ? Schema::hasTable('notification_staff_prefs') : (bool) cache()->remember('notify_staff_prefs_ready', 300, fn () => Schema::hasTable('notification_staff_prefs'));
    }

    /** The mode for this person and this type: the company's lock, else their choice, else the company's default, else email. */
    public function modeFor(User $user, string $type): string
    {
        $grp = NotificationTypes::groupOf($type);
        $company = $this->company()[$grp];
        if ($company['locked'] || ! self::ready()) {
            return $company['mode'];
        }

        return (string) (DB::table('notification_staff_prefs')->where('user_id', $user->id)->where('grp', $grp)->value('mode') ?? $company['mode']);
    }

    /** @return array<string, array{mode: string, locked: bool}> the company's default and lock for every group */
    public function company(): array
    {
        $saved = NotifySettings::ready() ? ($this->settings->get('general')['staff_groups'] ?? []) : [];
        $out = [];
        foreach (array_keys(NotificationTypes::GROUPS) as $g) {
            $mode = $saved[$g]['mode'] ?? 'email';
            $out[$g] = ['mode' => isset(self::MODES[$mode]) ? $mode : 'email', 'locked' => (bool) ($saved[$g]['locked'] ?? false)];
        }

        return $out;
    }

    /** What the "How I hear about things" page shows. @return array<string, mixed> */
    public function page(User $user): array
    {
        $mine = self::ready() ? DB::table('notification_staff_prefs')->where('user_id', $user->id)->pluck('mode', 'grp')->all() : [];
        $company = $this->company();
        $general = NotifySettings::ready() ? $this->settings->get('general') : NotifySettings::DEFAULTS['general'];

        return [
            'ready' => self::ready(),
            'modes' => self::MODES,
            'groups' => collect(NotificationTypes::GROUPS)->map(fn ($g, $k) => [
                'key' => $k, 'label' => $g[0], 'types' => array_map(fn ($t) => NotificationTypes::label($t), $g[1]),
                'company' => $company[$k]['mode'], 'locked' => $company[$k]['locked'], 'mine' => $company[$k]['locked'] ? null : ($mine[$k] ?? null),
                'uses' => $company[$k]['locked'] ? $company[$k]['mode'] : ($mine[$k] ?? $company[$k]['mode']),
            ])->values()->all(),
            'phone' => trim((string) ($user->phone ?? '')) ?: null,
            'email' => $user->email,
            'whatsapp_on' => (bool) ($general['whatsapp_enabled'] ?? false),
            'email_on' => (bool) ($general['email_enabled'] ?? true),
        ];
    }

    /** @param array<string, ?string> $choices group => bell|email|whatsapp, or null / "default" to follow the company */
    public function save(User $user, array $choices): array
    {
        if (! self::ready()) {
            throw new NotifyException('Choosing how you hear about things needs database script 262.');
        }
        $company = $this->company();
        $page = $this->page($user);
        foreach ($choices as $grp => $mode) {
            if (! isset($company[$grp])) {
                throw ValidationException::withMessages(['choices' => 'Choose from the groups listed.']);
            }
            $mode = $mode === 'default' || $mode === '' ? null : $mode;
            if ($mode !== null && ! isset(self::MODES[$mode])) {
                throw ValidationException::withMessages(['choices' => 'Choose bell only, bell and email, or bell and WhatsApp.']);
            }
            if ($company[$grp]['locked']) {
                throw new NotifyException('The company decides how "' . NotificationTypes::GROUPS[$grp][0] . '" reaches you.');
            }
            if ($mode === 'whatsapp' && ! $page['whatsapp_on']) {
                throw new NotifyException('The company does not send WhatsApp messages yet.');
            }
            if ($mode === 'whatsapp' && ! $page['phone']) {
                throw new NotifyException('Add your phone number to your staff profile first: WhatsApp messages go to that number.');
            }
            if ($mode === null) {
                DB::table('notification_staff_prefs')->where(['user_id' => $user->id, 'grp' => $grp])->delete();
            } else {
                DB::table('notification_staff_prefs')->updateOrInsert(['user_id' => $user->id, 'grp' => $grp], ['mode' => $mode, 'updated_at' => now()]);
            }
        }

        return $this->page($user);
    }
}
