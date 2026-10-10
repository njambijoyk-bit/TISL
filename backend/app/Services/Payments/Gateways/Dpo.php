<?php

namespace App\Services\Payments\Gateways;

use App\Models\Books\PaymentAttempt;
use Illuminate\Http\Request;

/**
 * DPO Group (DPO Pay) API v6: an XML call makes a payment token, the customer pays on DPO's page and comes back with the token, which we verify with a second XML call.
 * DPO sends nothing signed, so the return (and any server notification) is only used to learn which payment to ask about.
 */
class Dpo extends AbstractGateway
{
    private const API = 'https://secure.3gdirectpay.com/API/v6/';

    private const PAY = 'https://secure.3gdirectpay.com/payv2.php?ID=';

    public function key(): string
    {
        return 'dpo';
    }

    public function label(): string
    {
        return 'DPO Group';
    }

    public function fields(): array
    {
        return [
            $this->field('company_token', 'Company token', 'secret', 'From your DPO account (My Account → Company details, or ask DPO support). A UUID.'),
            $this->field('service_type', 'Service type', 'text', 'The number of the service you set up in DPO for these sales (shown in the DPO dashboard under Services).'),
        ];
    }

    public function secrets(): array
    {
        return ['company_token'];
    }

    public function rules(): array
    {
        return ['company_token' => 'sometimes|nullable|string|max:100', 'service_type' => ['sometimes', 'nullable', 'regex:/^\d{1,10}$/']];
    }

    public function configured(array $cfg): bool
    {
        return ($cfg['company_token'] ?? '') !== '' && ($cfg['service_type'] ?? '') !== '';
    }

    public function help(): array
    {
        return ['docs' => 'https://docs.dpopay.com/api/index.html', 'steps' => [
            'Get your Company token and the Service type number from your DPO account manager or the DPO dashboard.',
            'There is nothing to add in the DPO dashboard: customers come back to our site with the payment token and we check it with DPO.',
        ]];
    }

    private function xml(string $body): \SimpleXMLElement
    {
        $r = $this->http()->withHeaders(['Content-Type' => 'application/xml'])->withBody($body, 'application/xml')->post(self::API);
        $x = @simplexml_load_string($r->body());
        if (! $x) {
            throw new \RuntimeException('DPO did not answer in a form we can read (answer ' . $r->status() . ').');
        }

        return $x;
    }

    private function e(?string $v): string
    {
        return htmlspecialchars((string) $v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    public function test(array $cfg): array
    {
        if (! $this->configured($cfg)) {
            return ['ok' => false, 'message' => 'Enter the company token and the service type.'];
        }
        try {
            // asks about a token that can not exist: with a good company token DPO says "no such transaction", with a bad one it refuses the company
            $x = $this->xml('<?xml version="1.0" encoding="utf-8"?><API3G><CompanyToken>' . $this->e($cfg['company_token']) . '</CompanyToken><Request>verifyToken</Request><TransactionToken>00000000-0000-0000-0000-000000000000</TransactionToken></API3G>');
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => 'Could not reach DPO: ' . $this->plain($e)];
        }
        $code = (string) $x->Result;
        if (in_array($code, ['801', '802', '803', '804'], true)) {
            return ['ok' => false, 'message' => 'DPO did not accept the company token: ' . ((string) $x->ResultExplanation ?: "code {$code}")];
        }

        return ['ok' => true, 'message' => 'DPO recognised the company token. (The service type is proved by the first real payment.)'];
    }

    public function start(array $cfg, array $p): array
    {
        $xml = '<?xml version="1.0" encoding="utf-8"?><API3G><CompanyToken>' . $this->e($cfg['company_token']) . '</CompanyToken><Request>createToken</Request><Transaction>'
            . '<PaymentAmount>' . number_format($p['amount'], 2, '.', '') . '</PaymentAmount><PaymentCurrency>' . $this->e(strtoupper($p['currency'])) . '</PaymentCurrency>'
            . '<CompanyRef>' . $this->e($p['reference']) . '</CompanyRef><RedirectURL>' . $this->e($p['return_url']) . '</RedirectURL><BackURL>' . $this->e($p['cancel_url']) . '</BackURL>'
            . '<CompanyRefUnique>1</CompanyRefUnique><PTL>5</PTL>'
            . ($p['email'] ? '<customerEmail>' . $this->e($p['email']) . '</customerEmail>' : '') . ($p['phone'] ? '<customerPhone>' . $this->e(preg_replace('/\D+/', '', $p['phone'])) . '</customerPhone>' : '')
            . ($p['name'] ? '<customerFirstName>' . $this->e(explode(' ', trim($p['name']))[0]) . '</customerFirstName>' : '')
            . '</Transaction><Services><Service><ServiceType>' . $this->e($cfg['service_type']) . '</ServiceType><ServiceDescription>' . $this->e(mb_substr($p['description'], 0, 100)) . '</ServiceDescription>'
            . '<ServiceDate>' . now()->format('Y/m/d H:i') . '</ServiceDate></Service></Services></API3G>';
        $x = $this->xml($xml);
        if ((string) $x->Result !== '000' || (string) $x->TransToken === '') {
            throw new \RuntimeException('DPO did not start the payment: ' . ((string) $x->ResultExplanation ?: 'code ' . (string) $x->Result));
        }

        return ['redirect_url' => self::PAY . (string) $x->TransToken, 'provider_ref' => (string) $x->TransToken];
    }

    public function verify(array $cfg, PaymentAttempt $attempt): array
    {
        if (! $attempt->checkout_request_id) {
            return $this->pending();
        }
        try {
            $x = $this->xml('<?xml version="1.0" encoding="utf-8"?><API3G><CompanyToken>' . $this->e($cfg['company_token']) . '</CompanyToken><Request>verifyToken</Request><TransactionToken>' . $this->e($attempt->checkout_request_id) . '</TransactionToken></API3G>');
        } catch (\Throwable) {
            return $this->pending();
        }
        $code = (string) $x->Result;
        if ($code === '000') {
            return $this->paid((float) $x->TransactionAmount, (string) $x->TransactionCurrency, (string) ($x->TransactionApproval ?: $x->TransactionRef ?: $attempt->checkout_request_id));
        }

        // 901 declined, 902 data mismatch, 903 expired, 904 cancelled; 900 not paid yet and anything else is not a verdict
        return in_array($code, ['901', '902', '903', '904'], true) ? $this->failed((string) ($x->ResultExplanation ?: 'DPO says the payment did not go through.')) : $this->pending();
    }

    public function parseWebhook(Request $request, array $cfg): ?array
    {
        $token = (string) ($request->input('TransactionToken') ?? $request->query('TransactionToken', ''));
        $ref = (string) ($request->input('CompanyRef') ?? $request->query('CompanyRef', ''));

        return $token !== '' || $ref !== '' ? ['reference' => $ref ?: null, 'provider_ref' => $token ?: null] : null;
    }
}
