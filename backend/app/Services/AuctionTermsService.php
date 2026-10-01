<?php

namespace App\Services;

use App\Models\Auction;
use App\Models\Customer;
use App\Models\Policy;
use App\Models\PolicyAcceptance;
use App\Services\Books\BooksException;

/**
 * The auction terms: a policy a customer agrees to before registering for an auction or placing a bid.
 * Agreeing is recorded (who, which version, what it said, from where) and holds for every auction until the
 * policy gets a new major version. Switch it off in Settings → Policies (inactive, or "requires acceptance" off).
 */
class AuctionTermsService
{
    public const KEY = 'auction_terms';
    public const CONTEXT = 'auction_bidding';

    /** The policy row, created with sensible default wording the first time it is needed. */
    public function ensure(): Policy
    {
        return Policy::firstOrCreate(['key' => self::KEY], [
            'title' => 'Auction Terms & Bidding Rules',
            'content' => $this->defaultContent(),
            'disagree_consequence_text' => 'Without agreeing to the auction terms you cannot register for auctions or place bids.',
            'sensitivity' => 'standard', 'major_version' => 1, 'minor_version' => 0,
            'requires_acceptance' => true, 'is_active' => true,
        ]);
    }

    /** The policy when bidders must agree to it, otherwise null. */
    public function required(): ?Policy
    {
        $p = Policy::where('key', self::KEY)->first() ?? $this->ensure();

        return $p->is_active && $p->requires_acceptance ? $p : null;
    }

    public function accepted(?Customer $customer, Policy $policy): bool
    {
        if (! $customer) {
            return false;
        }
        $last = PolicyAcceptance::where('customer_id', $customer->id)->where('policy_key', self::KEY)->where('response', 'accepted')->latest('accepted_at')->first();

        return $last && (int) explode('.', (string) $last->policy_version)[0] >= (int) $policy->major_version;
    }

    /** For the auction screens: is there a policy to agree to, and has this customer already done so. */
    public function status(?Customer $customer): array
    {
        $p = $this->required();

        return ['required' => (bool) $p, 'accepted' => $p ? $this->accepted($customer, $p) : true, 'policy_key' => self::KEY, 'title' => $p?->title, 'version' => $p?->version];
    }

    /** Let a customer through when they have agreed (now or before); the agreement made now is recorded. */
    public function enforce(?Customer $customer, array $in, ?Auction $auction): void
    {
        $p = $this->required();
        if (! $p || ($customer && $this->accepted($customer, $p))) {
            return;
        }
        $agreed = collect($in['policy_acceptances'] ?? [])->contains(fn ($a) => ($a['key'] ?? null) === self::KEY && ($a['response'] ?? 'accepted') === 'accepted');
        if (! $agreed || ! $customer) {
            throw new BooksException('Please agree to the ' . $p->title . ' to register or bid.');
        }
        PolicyAcceptance::create([
            'policy_id' => $p->id, 'policy_key' => $p->key, 'policy_version' => $p->version, 'policy_snapshot' => $p->content,
            'customer_id' => $customer->id, 'user_id' => $customer->user_id ?? null, 'customer_number' => $customer->customer_number,
            'action_context' => self::CONTEXT, 'reference_type' => $auction ? 'auction' : null, 'reference_id' => $auction?->id,
            'response' => 'accepted', 'ip_address' => request()->ip(), 'user_agent' => substr((string) request()->userAgent(), 0, 500),
            'was_successful' => true, 'flagged' => false, 'accepted_at' => now(),
        ]);
    }

    private function defaultContent(): string
    {
        return <<<'TXT'
## Auction Terms & Bidding Rules

By registering for an auction or placing a bid you agree to the following.

**1. Bids are binding.** A bid is an offer to buy at that price. You cannot withdraw a bid once it is placed. If you are the highest bidder when the auction closes you must buy the item.

**2. Automatic bidding.** When you enter a maximum bid, the system bids for you in the smallest steps needed to keep you in front, up to your maximum. You are never asked to pay more than your winning bid plus the charges and taxes shown on the auction.

**3. Charges.** The auction page shows every charge that applies on top of the winning bid (for example buyer's premium, handling or delivery) and the taxes on them. Any registration fee or deposit is also shown before you register.

**4. Registration fees and deposits.** An entry fee is not refundable. A deposit is held while the auction runs and is released to your account when the auction closes, to be refunded or set against your order. A deposit may be kept if a winner does not complete the purchase.

**5. Winning.** If you win, an order is raised for you. You must pay it within the time shown on the order. If you do not, we may cancel the sale, keep your deposit, offer the item to another bidder and suspend your bidding.

**6. Fair bidding.** You must not bid to raise a price artificially, bid with the help of the seller, use more than one account, or interfere with the auction. We may cancel bids, void a sale or close an account for any of these.

**7. Items and errors.** Items are sold as described on the auction page. If a listing contains an obvious error, or an item turns out to be unavailable, we may cancel the auction and refund anything you paid for it.

**8. Records.** We keep a record of your agreement to these terms and of every bid you place.

Agreeing once covers every auction until these terms change in a way that needs you to agree again.
TXT;
    }
}
