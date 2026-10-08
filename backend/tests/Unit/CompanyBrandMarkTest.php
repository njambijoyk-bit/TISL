<?php

namespace Tests\Unit;

use App\Models\CompanyProfile;
use PHPUnit\Framework\TestCase;

/** What the admin sidebar shows for the business: the short code, else a mark from the trading name, else from the legal name. */
class CompanyBrandMarkTest extends TestCase
{
    public function test_a_name_is_shortened_to_the_first_letters_of_its_words(): void
    {
        $this->assertSame('TISL', CompanyProfile::abbreviate('Tisl Industrial Supply Limited'));
        $this->assertSame('AFL', CompanyProfile::abbreviate('Acme Foods Ltd'));
        $this->assertSame('SEA', CompanyProfile::abbreviate('Sun and Earth of Africa'));
        $this->assertSame('JKA', CompanyProfile::abbreviate('Jomo & Kamau Associates'));
        $this->assertSame('MWR', CompanyProfile::abbreviate("Mama Wanjiru's  restaurant"));
        $this->assertSame('ZURI', CompanyProfile::abbreviate('Zuri'));
        $this->assertSame('SAFA', CompanyProfile::abbreviate('Safaricom'));
        $this->assertSame('ÉL', CompanyProfile::abbreviate('Édith Lumière'));
    }

    public function test_at_most_five_letters_and_nothing_from_a_nameless_input(): void
    {
        $this->assertSame('ABGDE', CompanyProfile::abbreviate('Alpha Beta Gamma Delta Epsilon Zeta Eta'));
        $this->assertSame('', CompanyProfile::abbreviate(''));
        $this->assertSame('', CompanyProfile::abbreviate(null));
        $this->assertSame('', CompanyProfile::abbreviate(' - & - '));
        $this->assertSame('TO', CompanyProfile::abbreviate('The Of'));   // only connectors: they are kept rather than leaving nothing
    }

    public function test_the_short_code_wins_then_the_trading_name_then_the_legal_name(): void
    {
        $saved = fn (array $a) => (function () use ($a) { $c = new CompanyProfile($a); $c->exists = true; return $c; })();

        $this->assertSame('TSL', $saved(['short_code' => 'TSL', 'name' => 'Other Name', 'legal_name' => 'Legal Name Ltd'])->brandMark());
        $this->assertSame('ON', $saved(['short_code' => '  ', 'name' => 'Other Name', 'legal_name' => 'Legal Name Ltd'])->brandMark());
        $this->assertSame('ON', $saved(['short_code' => null, 'name' => 'Other Name', 'legal_name' => 'Legal Name Ltd'])->brandMark());
        $this->assertSame('LNL', $saved(['short_code' => '', 'name' => '', 'legal_name' => 'Legal Name Ltd'])->brandMark());
        $this->assertSame('', $saved(['short_code' => '', 'name' => '', 'legal_name' => ''])->brandMark());
    }

    public function test_a_profile_that_was_never_saved_ignores_its_placeholder_code(): void
    {
        $placeholder = new CompanyProfile(['name' => 'Fresh Install App', 'short_code' => 'CO']);
        $this->assertSame('FIA', $placeholder->brandMark());
    }
}
