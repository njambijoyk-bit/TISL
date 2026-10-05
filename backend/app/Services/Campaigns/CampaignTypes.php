<?php

namespace App\Services\Campaigns;

/**
 * The campaign types. A type is a preset, not a separate system: a key, a label, a family, what it needs, its goals and the sections a new
 * campaign of that type starts with. `available` ones can be created; `planned` ones are listed (locked) and refused by the API.
 */
class CampaignTypes
{
    public const GOALS = ['reach' => 'Reach (people seeing it)', 'sales' => 'Sales'];

    /** @return array<string,array> */
    public static function all(): array
    {
        $planned = fn (string $label, string $family, string $about, array $needs = []) => ['label' => $label, 'family' => $family, 'status' => 'planned', 'about' => $about, 'needs' => $needs, 'goals' => ['reach'], 'sections' => []];

        return [
            'awareness_sale' => ['label' => 'Awareness-to-Sale', 'family' => 'Brand and marketing', 'status' => 'available', 'about' => 'A launch, drop, collection, teaser or flash sale with a conversion goal.',
                'needs' => [], 'goals' => ['sales', 'reach'], 'sections' => ['hero', 'countdown', 'story', 'products']],
            'brand' => ['label' => 'Brand Campaign', 'family' => 'Brand and marketing', 'status' => 'available', 'about' => 'Builds the brand identity without selling one product.',
                'needs' => [], 'goals' => ['reach'], 'sections' => ['hero', 'story']],

            'collaboration' => $planned('Collaboration', 'Brand and marketing', 'Two brands or creators working together.'),
            'influencer' => $planned('Influencer Campaign', 'Brand and marketing', 'Creator-led promotion.'),
            'ambassador' => $planned('Ambassador Campaign', 'Brand and marketing', 'Recruit and manage brand ambassadors.'),
            'auction' => $planned('Auction Campaign', 'Brand and marketing', 'Promote a timed auction.', ['ecommerce.auctions']),

            'event' => $planned('Event Promotion', 'Other modules', 'Drive attendance to an event.', ['events']),
            'ticket' => $planned('Ticket Campaign', 'Other modules', 'Sell and market event tickets.', ['events']),
            'course' => $planned('Course Enrollment', 'Other modules', 'Drive registrations for a course.', ['courses']),
            'real_estate' => $planned('Real Estate Campaign', 'Other modules', 'Promote properties or projects.', ['listings']),

            'research' => $planned('Research', 'Participation and research', 'Gather responses and data.'),
            'survey' => $planned('Survey', 'Participation and research', 'Collect structured feedback.'),
            'product_testing' => $planned('Product Testing', 'Participation and research', 'Recruit people to test something.'),
            'beta' => $planned('Beta Launch', 'Participation and research', 'Recruit early users.'),
            'idea' => $planned('Idea Campaign', 'Participation and research', 'Collect ideas from the community.'),
            'innovation' => $planned('Innovation Challenge', 'Participation and research', 'Ask people to solve a problem.'),

            'fundraiser' => $planned('Fundraiser', 'Cause', 'Raise money for a cause, person or project.'),
            'crowdfunding' => $planned('Crowdfunding', 'Cause', 'Fund a product, business or creative project.'),
            'donation_drive' => $planned('Donation Drive', 'Cause', 'Collect money, goods, food, clothes or supplies.'),
            'charity' => $planned('Charity', 'Cause', 'Support a charitable cause.'),
            'relief' => $planned('Relief', 'Cause', 'Emergency and disaster assistance.'),
            'environmental' => $planned('Environmental', 'Cause', 'Cleanups, recycling, conservation.'),
            'health' => $planned('Health & Wellness', 'Cause', 'Awareness, screening and wellness initiatives.'),
            'awareness' => $planned('Awareness', 'Cause', 'Educate people or bring attention to an issue.'),
            'community_drive' => $planned('Community Drive', 'Cause', 'Mobilize people around a local initiative.'),
            'petition' => $planned('Petition', 'Cause', 'Collect signatures and support.'),
            'advocacy' => $planned('Advocacy', 'Cause', 'Push for a social, institutional or policy change.'),
            'political' => $planned('Political / Institutional', 'Cause', 'Public information or an organisation\'s campaign.'),
        ];
    }

    public static function find(string $key): ?array
    {
        return self::all()[$key] ?? null;
    }

    public static function isAvailable(string $key): bool
    {
        return (self::find($key)['status'] ?? null) === 'available';
    }

    /** @return string[] the keys that can be created now */
    public static function availableKeys(): array
    {
        return array_keys(array_filter(self::all(), fn ($t) => $t['status'] === 'available'));
    }
}
