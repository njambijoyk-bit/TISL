<?php

namespace Tests\Feature;

use App\Models\NotificationDelivery;
use App\Models\User;
use App\Services\Notify\NotificationTypes;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotifyException;
use App\Services\Notify\NotifySettings;
use App\Services\Notify\StaffChannels;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;

/** Build 6.4 (docs/PROJECTS_STAGE6_SPEC.md): staff choose how they hear, per group of notices; the company sets defaults and can lock a group. */
class NotifyStaffChannelsTest extends NotifyTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Schema::table('users', fn ($t) => $t->string('phone')->nullable());
        Schema::create('notification_staff_prefs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->string('grp', 30); $t->string('mode', 10); $t->timestamp('updated_at')->nullable(); $t->unique(['user_id', 'grp']); });
        Queue::fake();
    }

    private function colleague(?string $phone = '0722000111'): User
    {
        $u = new class extends User {
            protected $table = 'users';

            public function isStaff(): bool
            {
                return true;
            }

            public function getForeignKey()
            {
                return 'user_id';
            }

            public function getMorphClass()
            {
                return User::class;
            }
        };
        $u->forceFill(['name' => 'Kamau', 'email' => 'kamau@example.com', 'password' => 'x', 'phone' => $phone])->save();

        return $u;
    }

    private function send(User $to, string $type = 'project_task'): array
    {
        return app(Notifier::class)->send($to, $type, 'Task given to you', 'P-0001-T3 File the defence');
    }

    public function test_every_staff_type_has_a_group_and_nothing_changes_until_someone_chooses(): void
    {
        foreach (NotificationTypes::ALL as $type => [, , $audience]) {
            if ($audience === 'staff') {
                $this->assertArrayHasKey(NotificationTypes::groupOf($type), NotificationTypes::GROUPS);
            }
        }
        $this->assertSame('projects', NotificationTypes::groupOf('project_task'));
        $this->assertSame('other', NotificationTypes::groupOf('something_new'));
        $this->assertSame(['database', 'email'], $this->send($this->colleague())['channels']);
    }

    public function test_a_colleague_chooses_bell_only_or_whatsapp_for_a_group(): void
    {
        $k = $this->colleague();
        $channels = app(StaffChannels::class);
        $channels->save($k, ['projects' => 'bell']);
        $this->assertSame(['database'], $this->send($k)['channels']);
        $this->assertSame(['database', 'email'], $this->send($k, 'quotation_requested')['channels'], 'other groups are untouched');

        try {
            $channels->save($k, ['projects' => 'whatsapp']);
            $this->fail('WhatsApp is off for the company');
        } catch (NotifyException $e) {
            $this->assertSame('The company does not send WhatsApp messages yet.', $e->getMessage());
        }
        app(NotifySettings::class)->save('general', ['whatsapp_enabled' => true], $this->admin());
        $channels->save($k, ['projects' => 'whatsapp']);
        $r = $this->send($k);
        $this->assertSame(['database', 'whatsapp'], $r['channels']);
        $this->assertSame(['to_send', '+254722000111'], [NotificationDelivery::where('channel', 'whatsapp')->value('status'), NotificationDelivery::where('channel', 'whatsapp')->value('to_address')], 'sent the way the company sends WhatsApp now');

        $channels->save($k, ['projects' => 'default']);
        $this->assertSame(['database', 'email'], $this->send($k)['channels']);
        $this->assertSame(0, \DB::table('notification_staff_prefs')->count());

        $nophone = $this->colleague(null);
        $this->expectExceptionMessage('Add your phone number to your staff profile first');
        $channels->save($nophone, ['projects' => 'whatsapp']);
    }

    public function test_the_company_sets_a_default_and_can_lock_a_group(): void
    {
        $k = $this->colleague();
        $s = app(NotifySettings::class);
        $s->save('general', ['staff_groups' => ['projects' => ['mode' => 'bell'], 'security' => ['mode' => 'email', 'locked' => true], 'nonsense' => ['mode' => 'bell']]], $this->admin());
        $this->assertSame(['projects', 'security'], array_keys($s->get('general')['staff_groups']), 'only known groups are kept');
        $this->assertSame(['database'], $this->send($k)['channels'], 'the company default');
        app(StaffChannels::class)->save($k, ['projects' => 'email']);
        $this->assertSame(['database', 'email'], $this->send($k)['channels'], 'their own choice over the default');

        \DB::table('notification_staff_prefs')->insert(['user_id' => $k->id, 'grp' => 'security', 'mode' => 'bell']);   // chosen before the lock
        $this->assertSame(['database', 'email'], $this->send($k, 'project_security')['channels'], 'a lock wins');
        $page = app(StaffChannels::class)->page($k);
        $sec = collect($page['groups'])->firstWhere('key', 'security');
        $this->assertSame([true, 'email', null], [$sec['locked'], $sec['uses'], $sec['mine']]);
        $this->expectExceptionMessage('The company decides how "Security and approvals" reaches you.');
        app(StaffChannels::class)->save($k, ['security' => 'bell']);
    }

    public function test_an_old_style_bell_row_does_not_email_someone_who_chose_the_bell_only(): void
    {
        $k = $this->colleague();
        app(StaffChannels::class)->save($k, ['other' => 'bell']);
        $n = \App\Models\Notification::create(['notifiable_type' => User::class, 'notifiable_id' => $k->id, 'type' => 'legacy_thing', 'title' => 'x', 'message' => 'y', 'channels' => ['database', 'email']]);
        $n->setRelation('notifiable', $k);
        app(Notifier::class)->deliverExisting($n);
        $this->assertSame(0, NotificationDelivery::count());
    }
}
