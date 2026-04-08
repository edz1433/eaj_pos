<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class CheckMenuAccess
{
    public function handle(Request $request, Closure $next, string $menuId): Response
    {
        $user = Auth::user();

        if (!$user) {
            // Not logged in → redirect to login
            return redirect()->route('login');
        }

        if (!$user->hasAccess($menuId)) {
            $home = $user->hasAccess(2) ? route('pos.index') : route('login');
            return redirect()->to($home)->with('error', 'You do not have access to that page.');
        }

        return $next($request);
    }
}