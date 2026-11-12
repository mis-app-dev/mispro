<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CheckTokenLifetime
{
    public function handle(Request $request, Closure $next)
    {
        $token = $request->user()?->currentAccessToken();

        if ($token) {
            $lifetimeMinutes = 720; 

            $createdAt = $token->created_at;

            if ($createdAt && $createdAt->diffInMinutes(now()) >= $lifetimeMinutes) {
                $token->delete();
                Auth::guard('sanctum')->forget($request->user()); 

                return response()->json([
                    'success' => false,
                    'message' => 'Token expired. Please login again.'
                ], 401);
            }
        }

        return $next($request);
    }
}
