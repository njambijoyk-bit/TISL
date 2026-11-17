<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectHeldMoney;
use App\Services\Projects\ProjectSerious;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Client money (stage 4, builds 4.4 and 4.5): accounts, balances, receiving and paying out. */
class HeldMoneyController extends Controller
{
    public function __construct(private ProjectHeldMoney $held) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['accounts' => $this->held->accounts($user), 'ready' => $this->held->ready(), 'currency' => $this->currency()]
            + ($user->hasPermission('projects.money.held.pay') ? ['options' => $this->held->options()] : [])
            + ['can' => ['manage' => $user->hasPermission('projects.money.held.pay'), 'bank' => $user->hasPermission('projects.ledgers.bank')]]);
    }

    public function openAccount(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $this->held->openAccount($request->all(), $request->user());

            return $this->index($request)->setStatusCode(201);
        });
    }

    public function openBalance(Request $request, int $account): JsonResponse
    {
        return $this->guard(function () use ($request, $account) {
            $this->held->openBalance($account, $request->all(), $request->user());

            return $this->index($request)->setStatusCode(201);
        });
    }

    public function receive(Request $request, int $balance): JsonResponse
    {
        return $this->guard(function () use ($request, $balance) {
            $voucher = $this->held->receive($balance, $request->all(), $request->user());

            return response()->json(array_merge($this->index($request)->getData(true), ['voucher_id' => $voucher]), 201);
        });
    }

    public function payOut(Request $request, int $balance): JsonResponse
    {
        return $this->guard(function () use ($request, $balance) {
            [$h] = $this->held->holding($balance);
            $amount = round((float) $request->input('amount', 0), 2);
            $to = trim((string) $request->input('to', ''));
            $done = app(ProjectSerious::class)->gate($request, 'held.pay_out', $this->held->projectOf($balance), ['holding' => (int) $h->id, 'amount' => $amount, 'to' => $to],
                'pay ' . number_format($amount, 2) . " out of the client balance \"{$h->label}\" to {$to}");
            $voucher = $this->held->payOut($balance, $request->all(), $request->user());
            $done();

            return response()->json(array_merge($this->index($request)->getData(true), ['voucher_id' => $voucher]), 201);
        });
    }

    public function setGuard(Request $request, int $account): JsonResponse
    {
        return $this->guard(function () use ($request, $account) {
            $on = $request->boolean('on');
            $done = fn () => null;
            if (! $on) {
                $name = \Illuminate\Support\Facades\DB::table('project_client_accounts')->where('id', $account)->value('name') ?? '';
                $done = app(ProjectSerious::class)->gate($request, 'held.guard_off', null, ['account' => $account], "switch off the guard on the client money account \"{$name}\"");
            }
            $this->held->setGuard($account, $on, $request->user());
            $done();

            return $this->index($request);
        });
    }

    private function currency(): ?string
    {
        try {
            return app(\App\Services\CurrencyConversionService::class)->getBaseCurrency()->code ?? null;
        } catch (\Throwable) {
            return null;
        }
    }

    private function guard(callable $do): JsonResponse
    {
        try {
            return $do();
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }
    }
}
