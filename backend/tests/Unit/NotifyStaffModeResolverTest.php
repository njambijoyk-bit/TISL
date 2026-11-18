<?php

namespace Tests\Unit;

use App\Services\Notify\ChannelResolver;
use PHPUnit\Framework\TestCase;

/** Build 6.4 (docs/PROJECTS_STAGE6_SPEC.md): a staff member's choice per group of notices, as the ChannelResolver applies it. */
class NotifyStaffModeResolverTest extends TestCase
{
    private function plan(?string $mode, array $company = [], array $rule = [], array $person = []): array
    {
        $company += ['default_mode' => 'both', 'email_enabled' => true, 'whatsapp_enabled' => true, 'whatsapp_number_sources' => 'both', 'essential_only_default' => false];
        $person += ['kind' => 'staff', 'has_account' => true, 'email' => 'k@example.com', 'whatsapp' => '0712345678', 'whatsapp_source' => 'profile', 'staff_mode' => $mode];

        return (new ChannelResolver())->resolve($company, $rule, false, $person);
    }

    public function test_no_choice_is_exactly_as_before_bell_and_email(): void
    {
        $this->assertSame(['database', 'email'], $this->plan(null)['channels']);
        $this->assertSame(['database', 'email'], $this->plan('email')['channels']);
    }

    public function test_bell_only_drops_the_email_and_says_why(): void
    {
        $r = $this->plan('bell');
        $this->assertSame(['database'], $r['channels']);
        $this->assertSame(['email' => 'staff_choice'], $r['skipped']);
    }

    public function test_whatsapp_goes_instead_of_email_and_falls_back_to_email_when_it_cannot(): void
    {
        $this->assertSame(['database', 'whatsapp'], $this->plan('whatsapp')['channels']);
        $off = $this->plan('whatsapp', ['whatsapp_enabled' => false]);
        $this->assertSame(['database', 'email'], $off['channels'], 'nothing is lost');
        $this->assertSame('whatsapp_off', $off['skipped']['whatsapp']);
        $this->assertSame(['database', 'email'], $this->plan('whatsapp', [], [], ['whatsapp' => null])['channels']);
        $this->assertSame(['database', 'email'], $this->plan('whatsapp', [], ['channels' => ['email']])['channels'], 'a type the company keeps to email');
    }

    public function test_a_type_switched_off_is_still_the_bell_only(): void
    {
        $this->assertSame(['database'], $this->plan('whatsapp', [], ['enabled' => false])['channels']);
    }
}
