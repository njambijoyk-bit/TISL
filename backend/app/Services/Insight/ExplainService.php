<?php

namespace App\Services\Insight;

use App\Services\Ai\AiGateway;
use App\Services\Ai\AiGatewayException;

/** "Explain in words": the figures an insight already worked out, put into plain sentences by the AI keys set up for analytics. It adds no figures of its own. */
class ExplainService
{
    public function __construct(private AiGateway $ai) {}

    public function words(array $answer): string
    {
        $system = "You explain a business calculation to a shop owner in plain, short sentences (at most 120 words). "
            . "Use ONLY the figures in the data you are given; never invent, round differently or add numbers. "
            . "Say what it means (is it fine, a loss, a gain, something to check) and, if the data offers alternatives, mention the most useful one. No headings, no bullet lists.";
        $payload = json_encode(array_intersect_key($answer, array_flip(['title', 'subtitle', 'blocks', 'basis'])), JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
        try {
            $r = $this->ai->run('analytics', $system, [['role' => 'user', 'content' => "Explain this:\n" . mb_substr((string) $payload, 0, 12000)]], ['max_tokens' => 500, 'temperature' => 0.2]);
        } catch (AiGatewayException $e) {
            throw new \RuntimeException($e->kind === 'none' ? 'No AI key is set up for analytics yet. Add one under AI → Keys.' : 'The AI could not answer just now. Try again in a moment.');
        }

        return trim((string) $r['text']);
    }
}
