<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Login / reset-login: at most 5 attempts per minute for one account from one IP,
        // and 30 per minute from one IP overall (staff may share a single office IP).
        RateLimiter::for('login', function (Request $request) {
            $identifier = strtolower(trim((string) $request->input('identifier')));

            $tooMany = function () {
                return response()->json([
                    'success' => false,
                    'message' => 'Too many login attempts. Please try again in a minute.',
                ], 429);
            };

            return [
                Limit::perMinute(5)->by('login:' . $identifier . '|' . $request->ip())->response($tooMany),
                Limit::perMinute(30)->by('login-ip:' . $request->ip())->response($tooMany),
            ];
        });
    }
}
