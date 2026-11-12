<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('update:enrollment-status')->dailyAt('01:00');
Schedule::command('analytics:invalidate-today')->dailyAt('16:00');
Schedule::command('drafts:prune --apply')->weeklyOn(0, '02:00');