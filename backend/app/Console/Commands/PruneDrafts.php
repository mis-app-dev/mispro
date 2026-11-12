<?php

namespace App\Console\Commands;

use App\Models\Draft;
use Illuminate\Console\Command;

/**
 * A draft is created whenever a registration form is opened and deleted when it is submitted.
 * Forms that were closed without submitting leave their draft behind. Drafts hold only the
 * user, school year, semester and the date the form was opened, and nothing else refers to
 * them, so old ones can be removed safely.
 */
class PruneDrafts extends Command
{
    protected $signature = 'drafts:prune
                            {--days=30 : Remove drafts opened more than this many days ago}
                            {--apply : Delete them (without this, only shows what would be deleted)}';

    protected $description = 'Remove registration drafts that were never submitted';

    public function handle(): int
    {
        $days = (int) $this->option('days');

        if ($days < 7) {
            $this->error('--days must be at least 7, so forms that are still open are not affected.');
            return 1;
        }

        $cutoff = now()->subDays($days);
        $query = Draft::where('registration_date_draft', '<', $cutoff);
        $count = (clone $query)->count();

        if (!$this->option('apply')) {
            $this->info("{$count} draft(s) opened before {$cutoff->toDateString()} would be deleted. Run with --apply to delete them.");
            return 0;
        }

        $deleted = $query->delete();
        $this->info("Deleted {$deleted} draft(s) opened before {$cutoff->toDateString()}.");

        return 0;
    }
}
