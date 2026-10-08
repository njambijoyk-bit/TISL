<?php

namespace App\Http\Middleware;

use App\Services\Entity\CurrentEntity;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The company in context comes from an X-Entity header (the browser tab's choice, like X-Location for branches). Unknown ids are ignored.
 */
class SetEntityContext
{
    public function __construct(private CurrentEntity $entity) {}

    public function handle(Request $request, Closure $next): Response
    {
        $id = $request->header('X-Entity');
        if ($id !== null && is_numeric($id)) {
            $this->entity->setById((int) $id);
        }

        return $next($request);
    }
}
