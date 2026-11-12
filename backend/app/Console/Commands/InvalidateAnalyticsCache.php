<?php

namespace App\Console\Commands;

use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class InvalidateAnalyticsCache extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'analytics:invalidate-today';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Menghapus cache analytics untuk hari ini agar data ter-refresh';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $dateKey = Carbon::now()->format('Y-m-d');
        $cacheKey = 'analytics_full_v2_' . $dateKey;

        if (Cache::has($cacheKey)) {
            Cache::forget($cacheKey);
            $this->info("Cache analytics hari ini ($cacheKey) berhasil dihapus.");
            Log::info("Scheduler: Cache analytics ($cacheKey) telah di-invalidate otomatis.");
        } else {
            $this->info("Tidak ada cache analytics untuk hari ini ($cacheKey).");
        }
        
        return 0;
    }
}
