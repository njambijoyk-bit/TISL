<?php

namespace Tests\Unit;

use App\Services\Notify\ChannelResolver;
use PHPUnit\Framework\TestCase;

/**
 * Which channels a message uses, as a table of cases checked against a separate, plainly written oracle (docs/NOTIFICATIONS_PLAN.md, "Who gets what").
 */
class NotifyChannelResolverTest extends TestCase
{
    private ChannelResolver $r;

    protected function setUp(): void
    {
        $this->r = new ChannelResolver();
    }

    private function company(array $o = []): array
    {
        return $o + ['default_mode' => 'both', 'email_enabled' => true, 'whatsapp_enabled' => true, 'whatsapp_number_sources' => 'both', 'essential_only_default' => false];
    }

    private function person(array $o = []): array
    {
        return $o + ['kind' => 'customer', 'has_account' => true, 'email' => 'a@example.com', 'whatsapp' => '0712345678', 'whatsapp_source' => 'profile', 'mode' => null, 'essential_only' => null];
    }

    /** The rules written out the long way round, for one customer: what a person at the front desk would say. */
    private function oracle(array $company, array $rule, bool $essential, array $p): array
    {
        $out = ['database'];
        if (($rule['enabled'] ?? true) === false) {
            return $out;
        }
        $mode = $p['mode'] ?: $company['default_mode'];
        $essentialOnly = $p['essential_only'] ?? $company['essential_only_default'];
        if (! $essential && $essentialOnly) {
            return $out;
        }
        $emailPossible = $company['email_enabled'] && str_contains((string) $p['email'], '@');
        $waPossible = $company['whatsapp_enabled'] && strlen(preg_replace('/\D/', '', (string) $p['whatsapp'])) >= 8
            && in_array($p['whatsapp_source'], ['profile', 'checkout'], true) && ($company['whatsapp_number_sources'] === 'both' || $company['whatsapp_number_sources'] === $p['whatsapp_source']);
        $allowed = $rule['channels'] ?? ['email', 'whatsapp'];
        $email = $emailPossible && in_array('email', $allowed, true);
        $wa = $waPossible && in_array('whatsapp', $allowed, true);
        $wantEmail = $mode !== 'whatsapp';
        $wantWa = $mode !== 'email';
        $sendEmail = $wantEmail && $email;
        $sendWa = $wantWa && $wa;
        if (! $sendEmail && ! $sendWa && $essential) {   // never silent
            $sendEmail = ! $wantEmail && $email;
            $sendWa = ! $wantWa && $wa;
        }
        if ($sendEmail) {
            $out[] = 'email';
        }
        if ($sendWa) {
            $out[] = 'whatsapp';
        }

        return $out;
    }

    public function test_every_combination_agrees_with_the_oracle(): void
    {
        $n = 0;
        foreach (['email', 'whatsapp', 'both'] as $companyMode) {
            foreach ([true, false] as $emailOn) {
                foreach ([true, false] as $waOn) {
                    foreach (['profile', 'checkout', 'both'] as $sources) {
                        foreach ([null, 'email', 'whatsapp', 'both'] as $mode) {
                            foreach ([true, false] as $hasEmail) {
                                foreach ([true, false] as $hasNumber) {
                                    foreach (['profile', 'checkout', null] as $source) {
                                        foreach ([true, false] as $essential) {
                                            foreach ([null, true, false] as $essentialOnly) {
                                                foreach ([[], ['enabled' => false], ['channels' => ['email']], ['channels' => ['whatsapp']]] as $rule) {
                                                    $c = $this->company(['default_mode' => $companyMode, 'email_enabled' => $emailOn, 'whatsapp_enabled' => $waOn, 'whatsapp_number_sources' => $sources]);
                                                    $p = $this->person(['mode' => $mode, 'email' => $hasEmail ? 'a@example.com' : '', 'whatsapp' => $hasNumber ? '0712345678' : '', 'whatsapp_source' => $source, 'essential_only' => $essentialOnly]);
                                                    $got = $this->r->resolve($c, $rule, $essential, $p)['channels'];
                                                    $this->assertSame($this->oracle($c, $rule, $essential, $p), $got, json_encode(compact('c', 'rule', 'essential', 'p')));
                                                    $n++;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        $this->assertGreaterThan(10000, $n);
    }

    public function test_both_means_email_and_whatsapp_together(): void
    {
        $this->assertSame(['database', 'email', 'whatsapp'], $this->r->resolve($this->company(), [], true, $this->person())['channels']);
    }

    public function test_the_customers_own_choice_beats_the_company_default(): void
    {
        $this->assertSame(['database', 'email'], $this->r->resolve($this->company(['default_mode' => 'whatsapp']), [], true, $this->person(['mode' => 'email']))['channels']);
        $this->assertSame(['database', 'whatsapp'], $this->r->resolve($this->company(['default_mode' => 'email']), [], true, $this->person(['mode' => 'whatsapp']))['channels']);
    }

    public function test_whatsapp_waits_for_a_number_from_a_source_the_company_accepts(): void
    {
        $c = $this->company(['whatsapp_number_sources' => 'checkout']);
        $r = $this->r->resolve($c, [], false, $this->person(['whatsapp_source' => 'profile']));
        $this->assertSame(['database', 'email'], $r['channels']);
        $this->assertSame('number_source', $r['skipped']['whatsapp']);
        $this->assertSame(['database', 'email', 'whatsapp'], $this->r->resolve($c, [], false, $this->person(['whatsapp_source' => 'checkout']))['channels']);
    }

    public function test_an_essential_message_is_never_silent(): void
    {
        $p = $this->person(['mode' => 'whatsapp', 'whatsapp' => '']);   // wants WhatsApp, has no number
        $r = $this->r->resolve($this->company(), [], true, $p);
        $this->assertSame(['database', 'email'], $r['channels'], 'it falls back to email');
        $this->assertFalse($r['staff_list']);

        $none = $this->r->resolve($this->company(), [], true, $this->person(['email' => '', 'whatsapp' => '']));
        $this->assertSame(['database'], $none['channels']);
        $this->assertTrue($none['staff_list'], 'nobody to reach: staff are told');
    }

    public function test_a_message_that_does_not_matter_does_not_chase_the_other_channel(): void
    {
        $r = $this->r->resolve($this->company(), [], false, $this->person(['mode' => 'whatsapp', 'whatsapp' => '']));
        $this->assertSame(['database'], $r['channels']);
        $this->assertFalse($r['staff_list']);
    }

    public function test_essential_only_silences_the_rest_but_not_the_essentials(): void
    {
        $p = $this->person(['essential_only' => true]);
        $this->assertSame(['database'], $this->r->resolve($this->company(), [], false, $p)['channels']);
        $this->assertSame(['database', 'email', 'whatsapp'], $this->r->resolve($this->company(), [], true, $p)['channels']);
    }

    public function test_staff_get_the_bell_and_email_only(): void
    {
        $r = $this->r->resolve($this->company(), [], true, ['kind' => 'staff', 'has_account' => true, 'email' => 's@example.com', 'whatsapp' => '0712345678', 'whatsapp_source' => 'profile']);
        $this->assertSame(['database', 'email'], $r['channels']);
    }

    public function test_a_guest_with_no_account_gets_no_bell(): void
    {
        $this->assertSame(['email', 'whatsapp'], $this->r->resolve($this->company(), [], true, $this->person(['has_account' => false]))['channels']);
    }
}
