<?php

namespace Database\Seeders;

use App\Models\ContentPage;
use App\Models\ContentSection;
use Illuminate\Database\Seeder;

class ContentPageSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->pages() as $pageData) {
            $sections = $pageData['sections'] ?? [];
            unset($pageData['sections']);

            $page = ContentPage::updateOrCreate(
                ['slug' => $pageData['slug']],
                $pageData
            );

            foreach ($sections as $i => $sectionData) {
                ContentSection::updateOrCreate(
                    [
                        'page_id'     => $page->id,
                        'section_key' => $sectionData['section_key'],
                    ],
                    array_merge($sectionData, ['sort_order' => $i])
                );
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Page + section definitions
    // ─────────────────────────────────────────────────────────────

    private function pages(): array
    {
        return [
            // ── Homepage ─────────────────────────────────────────
            [
                'slug'      => 'homepage',
                'title'     => 'Homepage',
                'page_type' => 'homepage',
                'is_active' => true,
                'sections'  => [
                    [
                        'section_key'  => 'hero_main',
                        'section_type' => 'hero',
                        'title'        => 'Welcome to Our Store',
                        'subtitle'     => 'Quality products, delivered to your door',
                        'content'      => 'Discover our wide range of products and services tailored just for you.',
                        'image_url'    => 'https://placehold.co/1200x600',
                        'button_text'  => 'Shop Now',
                        'button_link'  => '/products',
                        'is_active'    => true,
                    ],
                    [
                        'section_key'  => 'features_main',
                        'section_type' => 'features',
                        'title'        => 'Why Choose Us',
                        'subtitle'     => 'We go above and beyond for every customer',
                        'items'        => [
                            ['title' => 'Fast Delivery',    'description' => 'Orders dispatched within 24 hours.',    'icon' => 'truck'],
                            ['title' => 'Quality Products', 'description' => 'Sourced from trusted manufacturers.',   'icon' => 'shield-check'],
                            ['title' => '24/7 Support',     'description' => 'Our team is always here to help you.', 'icon' => 'headset'],
                        ],
                        'is_active' => true,
                    ],
                    [
                        'section_key'  => 'stats_main',
                        'section_type' => 'stats',
                        'title'        => 'Our Numbers',
                        'items'        => [
                            ['label' => 'Happy Clients',      'value' => '1,200+'],
                            ['label' => 'Products Available', 'value' => '500+'],
                            ['label' => 'Orders Completed',   'value' => '8,000+'],
                            ['label' => 'Years in Business',  'value' => '10+'],
                        ],
                        'is_active' => true,
                    ],
                    [
                        'section_key'  => 'cta_main',
                        'section_type' => 'cta',
                        'title'        => 'Ready to Get Started?',
                        'subtitle'     => 'Join thousands of happy customers today',
                        'content'      => 'Browse our full catalogue and find exactly what you need.',
                        'image_url'    => 'https://placehold.co/1200x400',
                        'button_text'  => 'Browse Products',
                        'button_link'  => '/products',
                        'is_active'    => true,
                    ],
                ],
            ],

            // ── About ─────────────────────────────────────────────
            [
                'slug'      => 'about',
                'title'     => 'About Us',
                'page_type' => 'about',
                'is_active' => true,
                'sections'  => [
                    [
                        'section_key'  => 'hero_about',
                        'section_type' => 'hero',
                        'title'        => 'About Us',
                        'subtitle'     => 'Our story, values and the people behind our brand',
                        'image_url'    => 'https://placehold.co/1200x400',
                        'is_active'    => true,
                    ],
                    [
                        'section_key'  => 'mission_vision_main',
                        'section_type' => 'mission_vision',
                        'title'        => 'Our Mission & Vision',
                        'subtitle'     => 'What drives us every day',
                        'content'      => 'Our mission is to deliver exceptional products and services that make life easier. Our vision is to be the most trusted brand in our industry.',
                        'is_active'    => true,
                    ],
                    [
                        'section_key'  => 'values_main',
                        'section_type' => 'values',
                        'title'        => 'Our Core Values',
                        'subtitle'     => 'The principles that guide everything we do',
                        'items'        => [
                            ['title' => 'Integrity',   'description' => 'We do what we say and say what we do.', 'icon' => 'shield'],
                            ['title' => 'Innovation',  'description' => 'We constantly look for better ways.',   'icon' => 'lightbulb'],
                            ['title' => 'Customer First', 'description' => 'Every decision starts with you.',    'icon' => 'heart'],
                        ],
                        'is_active' => true,
                    ],
                    [
                        'section_key'  => 'team_main',
                        'section_type' => 'team',
                        'title'        => 'Meet the Team',
                        'subtitle'     => 'The people who make it happen',
                        'items'        => [
                            ['name' => 'Jane Doe',   'role' => 'CEO & Founder',       'image_url' => 'https://placehold.co/300x300', 'bio' => 'Jane founded the company in 2014 with a passion for great products.'],
                            ['name' => 'John Smith', 'role' => 'Head of Operations',  'image_url' => 'https://placehold.co/300x300', 'bio' => 'John keeps everything running smoothly behind the scenes.'],
                        ],
                        'is_active' => true,
                    ],
                    [
                        'section_key'  => 'stats_about',
                        'section_type' => 'stats',
                        'title'        => 'By the Numbers',
                        'items'        => [
                            ['label' => 'Founded',          'value' => '2014'],
                            ['label' => 'Team Members',     'value' => '45'],
                            ['label' => 'Countries Served', 'value' => '12'],
                        ],
                        'is_active' => true,
                    ],
                    [
                        'section_key'  => 'cta_about',
                        'section_type' => 'cta',
                        'title'        => 'Want to Work With Us?',
                        'subtitle'     => 'We are always looking for great talent',
                        'content'      => 'Check out our open positions or reach out directly.',
                        'button_text'  => 'Contact Us',
                        'button_link'  => '/contact',
                        'is_active'    => true,
                    ],
                ],
            ],

            // ── Contact ───────────────────────────────────────────
            [
                'slug'      => 'contact',
                'title'     => 'Contact Us',
                'page_type' => 'contact',
                'is_active' => true,
                'sections'  => [
                    [
                        'section_key'  => 'hero_contact',
                        'section_type' => 'hero',
                        'title'        => 'Get in Touch',
                        'subtitle'     => 'We would love to hear from you',
                        'is_active'    => true,
                    ],
                    [
                        'section_key'  => 'contact_info_main',
                        'section_type' => 'contact_info',
                        'title'        => 'Contact Details',
                        'subtitle'     => 'Reach us through any of the following',
                        'items'        => [
                            ['type' => 'email',   'value' => 'hello@example.com',       'label' => 'General Enquiries'],
                            ['type' => 'phone',   'value' => '+1 (555) 000-0000',        'label' => 'Phone Support'],
                            ['type' => 'address', 'value' => '123 Main St, Nairobi, KE', 'label' => 'Head Office'],
                            ['type' => 'hours',   'value' => 'Mon–Fri, 9am – 6pm',       'label' => 'Business Hours'],
                        ],
                        'is_active' => true,
                    ],
                    [
                        'section_key'  => 'faq_contact',
                        'section_type' => 'faq',
                        'title'        => 'Frequently Asked Questions',
                        'subtitle'     => 'Quick answers to common questions',
                        'items'        => [
                            ['question' => 'How long does shipping take?',    'answer' => 'Standard shipping takes 3–5 business days.'],
                            ['question' => 'Can I return a product?',         'answer' => 'Yes, we accept returns within 30 days of purchase.'],
                            ['question' => 'Do you offer bulk discounts?',    'answer' => 'Yes, contact our sales team for a custom quote.'],
                        ],
                        'is_active' => true,
                    ],
                    [
                        'section_key'  => 'cta_contact',
                        'section_type' => 'cta',
                        'title'        => 'Still Have Questions?',
                        'subtitle'     => 'Our team is ready to help',
                        'content'      => 'Send us a message and we will get back to you within 24 hours.',
                        'button_text'  => 'Send a Message',
                        'button_link'  => 'mailto:hello@example.com',
                        'is_active'    => true,
                    ],
                ],
            ],

            // ── Manual ────────────────────────────────────────────
            [
                'slug'      => 'manual',
                'title'     => 'User Manual',
                'page_type' => 'manual',
                'is_active' => true,
                'sections'  => [
                    [
                        'section_key'  => 'intro_manual',
                        'section_type' => 'rich_text',
                        'title'        => 'Getting Started',
                        'subtitle'     => 'Everything you need to know to get up and running',
                        'content'      => '<p>Welcome to the user manual. This guide will walk you through all the features available to you as a customer.</p>',
                        'is_active'    => true,
                    ],
                    [
                        'section_key'  => 'faq_manual',
                        'section_type' => 'faq',
                        'title'        => 'Common Questions',
                        'subtitle'     => 'Quick answers to help you navigate',
                        'items'        => [
                            ['question' => 'How do I place an order?',       'answer' => 'Browse products, add to cart, and proceed to checkout.'],
                            ['question' => 'How do I track my order?',       'answer' => 'Log in and visit My Orders to see real-time status.'],
                            ['question' => 'How do I request a quote?',      'answer' => 'Visit the Request Quote page and fill in the form.'],
                        ],
                        'is_active' => true,
                    ],
                    [
                        'section_key'  => 'links_manual',
                        'section_type' => 'links',
                        'title'        => 'Helpful Links',
                        'subtitle'     => 'Jump to the section you need',
                        'items'        => [
                            ['label' => 'Browse Products',  'url' => '/products',       'icon' => 'package'],
                            ['label' => 'My Orders',        'url' => '/orders',         'icon' => 'clipboard-list'],
                            ['label' => 'Request a Quote',  'url' => '/request-quote',  'icon' => 'file-text'],
                            ['label' => 'Contact Support',  'url' => '/contact',        'icon' => 'headset'],
                        ],
                        'is_active' => true,
                    ],
                ],
            ],

            // ── Footer ────────────────────────────────────────────
            [
                'slug'      => 'footer',
                'title'     => 'Footer',
                'page_type' => 'footer',
                'is_active' => true,
                'sections'  => [
                    [
                        'section_key'  => 'company_links',
                        'section_type' => 'links',
                        'title'        => 'Company',
                        'items'        => [
                            ['label' => 'About Us',  'url' => '/about'],
                            ['label' => 'Contact',   'url' => '/contact'],
                            ['label' => 'Manual',    'url' => '/manual'],
                        ],
                        'is_active' => true,
                    ],
                    [
                        'section_key'  => 'shop_links',
                        'section_type' => 'links',
                        'title'        => 'Shop',
                        'items'        => [
                            ['label' => 'Products',     'url' => '/products'],
                            ['label' => 'Services',     'url' => '/services'],
                            ['label' => 'Request Quote','url' => '/request-quote'],
                        ],
                        'is_active' => true,
                    ],
                    [
                        'section_key'  => 'account_links',
                        'section_type' => 'links',
                        'title'        => 'Account',
                        'items'        => [
                            ['label' => 'My Orders',   'url' => '/orders'],
                            ['label' => 'My Quotes',   'url' => '/my-quotes'],
                            ['label' => 'My Projects', 'url' => '/my-projects'],
                            ['label' => 'Profile',     'url' => '/profile'],
                        ],
                        'is_active' => true,
                    ],
                    [
                        'section_key'  => 'copyright_text',
                        'section_type' => 'text',
                        'title'        => 'Copyright',
                        'content'      => '© ' . date('Y') . ' Your Company Name. All rights reserved.',
                        'is_active'    => true,
                    ],
                ],
            ],
        ];
    }
}