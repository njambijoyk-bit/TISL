<?php

namespace App\Services\Chat;

class MimiHarmScannerService
{
    // ── Keyword categories ────────────────────────────────────────────────────
    // These apply to everyone — customers, guests, and staff.
    // Ordered from most specific to most general to get the most useful category.

    private const KEYWORD_CATEGORIES = [
        'HACKING' => [
            'sql injection', 'sqli', 'xss', 'cross site', 'csrf', 'remote code execution',
            'rce exploit', 'buffer overflow', 'reverse shell', 'payload', 'malware',
            'ransomware', 'keylogger', 'brute force password', 'privilege escalation',
            'zero day', '0day', 'metasploit', 'nmap scan', 'port scan', 'ddos',
            'denial of service', 'phishing kit', 'credential stuffing',
        ],
        'SEXUAL_CONTENT' => [
            'pornography', 'pornographic', 'explicit content', 'nude', 'nudity',
            'sexual act', 'masturbat', 'genitals', 'rape', 'sexual assault',
            'child abuse', 'csam', 'lolicon',
        ],
        'VIOLENCE' => [
            'how to kill', 'how to murder', 'make a bomb', 'build a bomb',
            'explosive device', 'suicide method', 'self harm method',
            'poison someone', 'stab', 'shoot someone',
        ],
        'HATE_SPEECH' => [
            'racial slur', 'ethnic cleansing', 'white supremacy', 'neo nazi',
            'genocide', 'concentration camp joke',
        ],
        'FRAUD' => [
            'money laundering', 'credit card fraud', 'carding', 'fake invoice',
            'scam script', 'phishing email template', 'identity theft',
        ],
        'DRUGS' => [
            'how to make meth', 'synthesize cocaine', 'drug synthesis',
            'fentanyl recipe', 'buy drugs online',
        ],
    ];

    // ── Gemini safety block categories ────────────────────────────────────────
    // Maps Gemini's harm category enum to our stored string

    private const GEMINI_CATEGORY_MAP = [
        'HARM_CATEGORY_HARASSMENT'        => 'HARASSMENT',
        'HARM_CATEGORY_HATE_SPEECH'       => 'HATE_SPEECH',
        'HARM_CATEGORY_SEXUALLY_EXPLICIT' => 'SEXUAL_CONTENT',
        'HARM_CATEGORY_DANGEROUS_CONTENT' => 'DANGEROUS_CONTENT',
    ];

    /**
     * Scan a query and the raw Gemini response for harmful content.
     *
     * Returns an array:
     *   [
     *     'is_harmful'    => bool,
     *     'harm_category' => string|null,   // e.g. 'HACKING', 'HARASSMENT'
     *     'source'        => 'keyword'|'gemini'|null,
     *   ]
     */
    public function scan(string $query, array $geminiResponse): array
    {
        // 1. Check if Gemini itself blocked the response
        $geminiHarm = $this->scanGeminiBlock($geminiResponse);
        if ($geminiHarm) {
            return [
                'is_harmful'    => true,
                'harm_category' => $geminiHarm,
                'source'        => 'gemini',
            ];
        }

        // 2. Keyword scan on the user's query
        $keywordHarm = $this->scanKeywords($query);
        if ($keywordHarm) {
            return [
                'is_harmful'    => true,
                'harm_category' => $keywordHarm,
                'source'        => 'keyword',
            ];
        }

        return [
            'is_harmful'    => false,
            'harm_category' => null,
            'source'        => null,
        ];
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private function scanGeminiBlock(array $geminiResponse): ?string
    {
        // Gemini returns a `promptFeedback.blockReason` or per-candidate `finishReason: SAFETY`
        // with `safetyRatings` when it blocks content.

        // Check promptFeedback block (whole prompt blocked)
        if (isset($geminiResponse['promptFeedback']['blockReason'])) {
            $ratings = $geminiResponse['promptFeedback']['safetyRatings'] ?? [];
            return $this->extractTopGeminiCategory($ratings)
                ?? $geminiResponse['promptFeedback']['blockReason'];
        }

        // Check per-candidate safety block
        $candidates = $geminiResponse['candidates'] ?? [];
        foreach ($candidates as $candidate) {
            if (($candidate['finishReason'] ?? '') === 'SAFETY') {
                $ratings = $candidate['safetyRatings'] ?? [];
                return $this->extractTopGeminiCategory($ratings) ?? 'SAFETY_BLOCK';
            }
        }

        return null;
    }

    private function extractTopGeminiCategory(array $safetyRatings): ?string
    {
        // Find the highest-probability blocked category
        foreach ($safetyRatings as $rating) {
            $blocked = in_array($rating['probability'] ?? '', ['MEDIUM', 'HIGH']);
            if ($blocked && isset($rating['category'])) {
                return self::GEMINI_CATEGORY_MAP[$rating['category']]
                    ?? $rating['category'];
            }
        }
        return null;
    }

    private function scanKeywords(string $query): ?string
    {
        $lower = mb_strtolower($query);

        foreach (self::KEYWORD_CATEGORIES as $category => $keywords) {
            foreach ($keywords as $keyword) {
                if (str_contains($lower, $keyword)) {
                    return $category;
                }
            }
        }

        return null;
    }
}
