<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Indonesian students registered before the registration code stored "Indonesia" have an
 * empty country, and the form snapshots (shown on the profile) never stored it. Fill in
 * "Indonesia" for Indonesian students only. Non-Indonesian students with an empty country
 * stay empty, and countries that are already filled in are not touched.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('students')
            ->where('citizenship', 'Indonesia')
            ->where(function ($q) {
                $q->whereNull('country')->orWhereRaw("TRIM(country) = ''");
            })
            ->update(['country' => 'Indonesia']);

        DB::statement("
            UPDATE application_form_versions
            SET data_snapshot = JSON_SET(data_snapshot, '$.request_data.country', 'Indonesia')
            WHERE JSON_UNQUOTE(JSON_EXTRACT(data_snapshot, '$.request_data.citizenship')) = 'Indonesia'
              AND (
                    JSON_EXTRACT(data_snapshot, '$.request_data.country') IS NULL
                 OR JSON_TYPE(JSON_EXTRACT(data_snapshot, '$.request_data.country')) = 'NULL'
                 OR TRIM(JSON_UNQUOTE(JSON_EXTRACT(data_snapshot, '$.request_data.country'))) = ''
              )
        ");
    }

    /**
     * Not reversible: the empty values carried no information.
     */
    public function down(): void
    {
    }
};
