<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * One-off repair of data left behind by three known bugs:
 *
 *  1. Father/mother addresses linked to the parent row of a previous enrollment.
 *  2. The same student stored twice under one student_id.
 *  3. Tables that fell behind the latest application form version after a profile edit.
 *
 * Runs as a dry run unless --apply is given. Every individual change is written to a
 * report file so it can be reviewed; the console only shows totals.
 */
class RepairStudentData extends Command
{
    protected $signature = 'data:repair
        {--apply : Write the changes (without this flag nothing is modified)}
        {--only= : Comma separated steps to run: addresses,duplicates,sync}
        {--report= : Path of the detail report (default: storage/logs/data-repair-<time>.txt)}';

    protected $description = 'Repair mislinked parent addresses, duplicate students and tables that are behind the form history';

    private const ADDRESS_FIELDS = ['street', 'rt', 'rw', 'village', 'district', 'city_regency', 'province', 'other'];

    private const PARENT_FIELDS = [
        'father_name', 'father_occupation', 'father_company', 'father_phone', 'father_email',
        'mother_name', 'mother_occupation', 'mother_company', 'mother_phone', 'mother_email',
    ];

    /** Student columns a normal re-registration would refresh from the newest form. */
    private const STUDENT_REFRESH_FIELDS = [
        'first_name', 'middle_name', 'last_name', 'nickname', 'gender', 'age', 'family_rank',
        'citizenship', 'country', 'religion', 'place_of_birth', 'date_of_birth', 'email',
        'previous_school', 'phone_number', 'academic_status', 'academic_status_other',
        'status', 'active', 'nik', 'kitas', 'nisn', 'va_mandiri', 'va_bca', 'va_bni', 'va_bri',
    ];

    private bool $apply = false;
    private array $lines = [];
    private array $totals = [];
    private array $nullable = [];

    public function handle(): int
    {
        $this->apply = (bool) $this->option('apply');
        $steps = $this->option('only')
            ? array_map('trim', explode(',', $this->option('only')))
            : ['addresses', 'duplicates', 'sync'];

        $database = DB::connection()->getDatabaseName();
        $host = config('database.connections.' . config('database.default') . '.host');

        $this->line("Database : {$database} @ {$host}");
        $this->line('Mode     : ' . ($this->apply ? 'APPLY (changes will be written)' : 'dry run (nothing is modified)'));
        $this->note("Database: {$database} @ {$host}");
        $this->note('Mode: ' . ($this->apply ? 'APPLY' : 'dry run'));
        $this->note('Time: ' . now()->toDateTimeString());

        $run = function () use ($steps) {
            if (in_array('addresses', $steps, true)) {
                $this->relinkParentAddresses('father_addresses', 'father_address_id');
                $this->relinkParentAddresses('mother_addresses', 'mother_address_id');
            }
            if (in_array('duplicates', $steps, true)) {
                $this->mergeDuplicateStudents();
            }
            if (in_array('sync', $steps, true)) {
                $this->syncTablesFromLatestForm();
            }
        };

        if ($this->apply) {
            DB::transaction($run);
        } else {
            $run();
        }

        $path = $this->option('report') ?: storage_path('logs/data-repair-' . now()->format('Ymd-His') . '.txt');
        file_put_contents($path, implode(PHP_EOL, $this->lines) . PHP_EOL);

        $this->newLine();
        if (empty($this->totals)) {
            $this->info('Nothing to repair.');
        } else {
            $rows = [];
            foreach ($this->totals as $label => $count) {
                $rows[] = [$label, $count];
            }
            $this->table(['Change', $this->apply ? 'Applied' : 'Would apply'], $rows);
        }
        $this->line("Detail report: {$path}");

        return self::SUCCESS;
    }

    // ---------------------------------------------------------------------
    // 1. Parent addresses linked to the parent row of another enrollment
    // ---------------------------------------------------------------------
    private function relinkParentAddresses(string $table, string $key): void
    {
        $this->note('');
        $this->note("== {$table}: addresses linked to the parent row of another enrollment ==");

        $rows = DB::table("{$table} as a")
            ->join('parents as p', 'p.parent_id', '=', 'a.parent_id')
            ->whereNotNull('a.enrollment_id')
            ->whereColumn('p.enrollment_id', '<>', 'a.enrollment_id')
            ->select("a.{$key} as address_id", 'a.parent_id as old_parent_id', 'a.enrollment_id')
            ->orderBy("a.{$key}")
            ->get();

        foreach ($rows as $row) {
            $targets = DB::table('parents')->where('enrollment_id', $row->enrollment_id)->pluck('parent_id');

            if ($targets->count() !== 1) {
                $this->skip("{$table} #{$row->address_id}: enrollment {$row->enrollment_id} has {$targets->count()} parent rows");
                continue;
            }

            $newParentId = $targets->first();

            if (DB::table($table)->where('parent_id', $newParentId)->exists()) {
                $this->skip("{$table} #{$row->address_id}: parent {$newParentId} already has an address");
                continue;
            }

            $this->note("{$table} #{$row->address_id} (enrollment {$row->enrollment_id}): parent_id {$row->old_parent_id} -> {$newParentId}");
            $this->count("{$table}: relinked to the correct parent row");

            if ($this->apply) {
                DB::table($table)->where($key, $row->address_id)->update(['parent_id' => $newParentId]);
            }
        }
    }

    // ---------------------------------------------------------------------
    // 2. The same student stored twice under one student_id
    // ---------------------------------------------------------------------
    private function mergeDuplicateStudents(): void
    {
        $this->note('');
        $this->note('== students: more than one row with the same student_id ==');

        $duplicateIds = DB::table('students')
            ->select('student_id')
            ->groupBy('student_id')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('student_id');

        foreach ($duplicateIds as $studentId) {
            $rows = DB::table('students')->where('student_id', $studentId)->orderBy('id')->get();
            $keep = $rows->first();

            foreach ($rows->slice(1) as $dup) {
                $sameName = mb_strtolower(trim((string) $keep->first_name)) === mb_strtolower(trim((string) $dup->first_name));
                $sameBirth = (string) $keep->date_of_birth === (string) $dup->date_of_birth;

                if (!$sameName || !$sameBirth) {
                    $this->skip("student_id {$studentId}: rows {$keep->id} and {$dup->id} differ in first name or date of birth - check by hand");
                    continue;
                }

                $this->mergeStudent($keep, $dup);
            }
        }
    }

    private function mergeStudent(object $keep, object $dup): void
    {
        $this->note("student_id {$keep->student_id}: merging row {$dup->id} into row {$keep->id}");
        $this->count('students: duplicate row merged into the original');

        // Enrollments of the duplicate continue the version sequence of the original.
        $nextVersion = (int) DB::table('enrollments')->where('id', $keep->id)->max('version');
        $enrollments = DB::table('enrollments')->where('id', $dup->id)->orderBy('registration_date')->get();

        foreach ($enrollments as $enrollment) {
            $nextVersion++;
            $this->note("  enrollment {$enrollment->enrollment_id} ({$enrollment->registration_id}): student row {$dup->id} -> {$keep->id}, version {$enrollment->version} -> {$nextVersion}");
            $this->count('enrollments: moved to the original student');

            if ($this->apply) {
                DB::table('enrollments')->where('enrollment_id', $enrollment->enrollment_id)
                    ->update(['id' => $keep->id, 'version' => $nextVersion]);
            }

            // Form history of that enrollment still names the duplicate row.
            $versions = DB::table('application_form_versions as v')
                ->join('application_forms as a', 'a.application_id', '=', 'v.application_id')
                ->where('a.enrollment_id', $enrollment->enrollment_id)
                ->select('v.version_id', 'v.data_snapshot')
                ->get();

            foreach ($versions as $version) {
                $snapshot = json_decode((string) $version->data_snapshot, true);
                if (!is_array($snapshot)) {
                    $this->skip("  form version {$version->version_id}: snapshot is not valid JSON");
                    continue;
                }

                // The application stores this id as a string inside the snapshot.
                $snapshot['id'] = (string) $keep->id;
                $snapshot['student_id'] = $keep->student_id;
                if (array_key_exists('studentall_id', $snapshot)) {
                    $snapshot['studentall_id'] = $keep->studentall_id;
                }

                // The application shows the photo stored in the form history. A form created on
                // the duplicate row has none, so carry over the photo the student is using.
                $photo = $this->normalize($keep->photo_path) ?? $this->normalize($dup->photo_path);
                if ($photo !== null
                    && is_array($snapshot['request_data'] ?? null)
                    && empty($snapshot['request_data']['photo_url'])) {
                    $snapshot['request_data']['photo_path'] = $photo;
                    $snapshot['request_data']['photo_url'] = asset('storage/' . $photo);
                    $this->note("  form version {$version->version_id}: photo added from the student row");
                }

                $this->note("  form version {$version->version_id}: now points to student row {$keep->id}");
                $this->count('form versions: pointed to the original student');

                if ($this->apply) {
                    DB::table('application_form_versions')->where('version_id', $version->version_id)
                        ->update(['data_snapshot' => json_encode($snapshot, JSON_PRETTY_PRINT)]);
                }
            }
        }

        foreach (['parents', 'student_addresses', 'student_guardians', 'payments'] as $table) {
            $moved = DB::table($table)->where('id', $dup->id)->count();
            if ($moved > 0) {
                $this->note("  {$table}: {$moved} row(s) moved to student row {$keep->id}");
                if ($this->apply) {
                    DB::table($table)->where('id', $dup->id)->update(['id' => $keep->id]);
                }
            }
        }

        // A normal re-registration refreshes the student row from the newest form.
        $refresh = [];
        foreach (self::STUDENT_REFRESH_FIELDS as $field) {
            // Never replace a filled value with an empty one.
            if (property_exists($dup, $field)
                && $this->normalize($dup->$field) !== null
                && $this->normalize($dup->$field) !== $this->normalize($keep->$field)) {
                $refresh[$field] = $dup->$field;
                $this->note("  students.{$field}: \"{$keep->$field}\" -> \"{$dup->$field}\"");
            }
        }
        foreach (['photo_path', 'card_number'] as $field) {
            if ($this->normalize($keep->$field) === null && $this->normalize($dup->$field) !== null) {
                $refresh[$field] = $dup->$field;
                $this->note("  students.{$field}: taken from the duplicate row");
            }
        }

        $this->note("  students: row {$dup->id} (studentall_id {$dup->studentall_id}) deleted");

        if ($this->apply) {
            if ($refresh) {
                DB::table('students')->where('id', $keep->id)->update($refresh + ['updated_at' => now()]);
            }
            DB::table('students')->where('id', $dup->id)->delete();
        }
    }

    // ---------------------------------------------------------------------
    // 3. Tables that fell behind the latest application form version
    // ---------------------------------------------------------------------
    private function syncTablesFromLatestForm(): void
    {
        $this->note('');
        $this->note('== tables behind the latest application form version ==');

        $validTransportIds = DB::table('transportations')->pluck('transport_id')->map(fn ($id) => (string) $id)->all();

        $forms = DB::table('application_forms as a')
            ->join('application_form_versions as v', function ($join) {
                $join->on('v.application_id', '=', 'a.application_id')
                    ->whereRaw('v.version_id = (SELECT MAX(v2.version_id) FROM application_form_versions v2 WHERE v2.application_id = a.application_id)');
            })
            ->select('a.application_id', 'a.enrollment_id', 'v.version_id', 'v.data_snapshot')
            ->orderBy('a.application_id')
            ->cursor();

        foreach ($forms as $form) {
            $snapshot = json_decode((string) $form->data_snapshot, true);
            $data = is_array($snapshot) ? ($snapshot['request_data'] ?? null) : null;

            if (!is_array($data)) {
                $this->skip("application {$form->application_id}: latest version {$form->version_id} has no request_data");
                continue;
            }

            $enrollmentId = $form->enrollment_id;

            // Student address
            $this->syncRows('student_addresses', 'student_address_id',
                DB::table('student_addresses')->where('enrollment_id', $enrollmentId)->get(),
                $this->pick($data, array_combine(self::ADDRESS_FIELDS, self::ADDRESS_FIELDS)), $enrollmentId);

            // Parents
            $this->syncRows('parents', 'parent_id',
                DB::table('parents')->where('enrollment_id', $enrollmentId)->get(),
                $this->pick($data, array_combine(self::PARENT_FIELDS, self::PARENT_FIELDS)), $enrollmentId);

            // Father / mother address
            foreach (['father' => 'father_address_id', 'mother' => 'mother_address_id'] as $who => $key) {
                $map = [];
                foreach (self::ADDRESS_FIELDS as $field) {
                    $map[$field] = "{$who}_address_{$field}";
                }
                $this->syncRows("{$who}_addresses", $key,
                    DB::table("{$who}_addresses")->where('enrollment_id', $enrollmentId)->get(),
                    $this->pick($data, $map), $enrollmentId);
            }

            // Guardian and guardian address (only when the guardian belongs to this enrollment alone)
            $guardianIds = DB::table('student_guardians')->where('enrollment_id', $enrollmentId)->pluck('guardian_id')->filter()->unique();
            foreach ($guardianIds as $guardianId) {
                if (DB::table('student_guardians')->where('guardian_id', $guardianId)->count() > 1) {
                    $this->skip("guardian {$guardianId}: shared by more than one enrollment");
                    continue;
                }

                $this->syncRows('guardians', 'guardian_id',
                    DB::table('guardians')->where('guardian_id', $guardianId)->get(),
                    $this->pick($data, [
                        'guardian_name' => 'guardian_name',
                        'relation_to_student' => 'relation_to_student',
                        'phone_number' => 'guardian_phone',
                        'guardian_email' => 'guardian_email',
                    ]), $enrollmentId);

                $map = [];
                foreach (self::ADDRESS_FIELDS as $field) {
                    $map[$field] = "guardian_address_{$field}";
                }
                $this->syncRows('guardian_addresses', 'guardian_address_id',
                    DB::table('guardian_addresses')->where('guardian_id', $guardianId)->get(),
                    $this->pick($data, $map), $enrollmentId);
            }

            // Transportation
            if (array_key_exists('transportation_id', $data)) {
                $wanted = $this->normalize($data['transportation_id']);
                if ($wanted !== null && !in_array($wanted, $validTransportIds, true)) {
                    $this->skip("enrollment {$enrollmentId}: transportation_id \"{$wanted}\" in the form does not exist");
                } else {
                    $this->syncRows('enrollments', 'enrollment_id',
                        DB::table('enrollments')->where('enrollment_id', $enrollmentId)->get(),
                        ['transport_id' => $wanted], $enrollmentId);
                }
            }
        }
    }

    /** Take the values present in the form data, keyed by table column. */
    private function pick(array $data, array $columnToFormKey): array
    {
        $values = [];
        foreach ($columnToFormKey as $column => $formKey) {
            if (array_key_exists($formKey, $data) && !is_array($data[$formKey])) {
                $values[$column] = $this->normalize($data[$formKey]);
            }
        }

        return $values;
    }

    private function syncRows(string $table, string $key, $rows, array $wanted, $enrollmentId): void
    {
        if (empty($wanted) || $rows->isEmpty()) {
            return;
        }

        if ($rows->count() > 1) {
            $this->skip("{$table}: enrollment {$enrollmentId} has {$rows->count()} rows");
            return;
        }

        $row = $rows->first();
        $changes = [];

        foreach ($wanted as $column => $value) {
            if (!property_exists($row, $column)) {
                continue;
            }
            if ($this->normalize($row->$column) === $value) {
                continue;
            }

            $changes[$column] = ($value === null && !$this->isNullable($table, $column)) ? '' : $value;
            $this->note("{$table} #{$row->$key} (enrollment {$enrollmentId}) {$column}: \"{$row->$column}\" -> \"" . ($value ?? 'NULL') . '"');
            $this->count("{$table}.{$column}: updated from the latest form");
        }

        if ($changes && $this->apply) {
            DB::table($table)->where($key, $row->$key)->update($changes);
        }
    }

    /** Empty strings, the literal "null" and NULL all mean "no value". */
    private function normalize($value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim((string) $value);

        return ($value === '' || strtolower($value) === 'null') ? null : $value;
    }

    private function isNullable(string $table, string $column): bool
    {
        if (!isset($this->nullable[$table])) {
            $this->nullable[$table] = DB::table('information_schema.COLUMNS')
                ->where('TABLE_SCHEMA', DB::connection()->getDatabaseName())
                ->where('TABLE_NAME', $table)
                ->pluck('IS_NULLABLE', 'COLUMN_NAME')
                ->map(fn ($v) => $v === 'YES')
                ->all();
        }

        return $this->nullable[$table][$column] ?? true;
    }

    private function note(string $line): void
    {
        $this->lines[] = $line;
    }

    private function skip(string $reason): void
    {
        $this->lines[] = "SKIPPED - {$reason}";
        $this->count('skipped (see report)');
    }

    private function count(string $label): void
    {
        $this->totals[$label] = ($this->totals[$label] ?? 0) + 1;
    }
}
