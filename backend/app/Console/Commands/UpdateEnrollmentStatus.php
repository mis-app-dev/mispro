<?php

namespace App\Console\Commands;

use App\Models\Student;
use App\Models\SchoolYear;
use App\Models\Enrollment;
use App\Services\AuditTrailService;
use App\Events\StudentStatusUpdated;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class UpdateEnrollmentStatus extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'update:enrollment-status';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Update enrollment status (ACTIVE/INACTIVE) based on current school year';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        \Log::info('Running UpdateEnrollmentStatus command at ' . now());
        $currentMonth = now()->month;
        $currentYear = now()->year;

        $schoolYearStr = ($currentMonth >= 7)
            ? $currentYear . '/' . ($currentYear + 1)
            : ($currentYear - 1) . '/' . $currentYear;

        $currentSchoolYear = SchoolYear::where('year', $schoolYearStr)->first();

        if (!$currentSchoolYear) {
            $this->error("School year {$schoolYearStr} not found.");
            return 1;
        }

        $currentId = $currentSchoolYear->school_year_id;

        // Students who cancelled their re-registration for this school year kept attending
        // until the end of the previous one. Now that this year has started, they leave.
        $withdrawn = $this->withdrawStudentsWithCancelledReRegistration($currentSchoolYear);

        $updatableStudentStatuses = ['Not Graduate'];

        // Update ACTIVE (only registrations that are still confirmed)
        $activeUpdated = Enrollment::query()
            ->where('enrollments.school_year_id', $currentId)
            ->join('students', 'enrollments.id', '=', 'students.id')
            ->join('application_forms', 'application_forms.enrollment_id', '=', 'enrollments.enrollment_id')
            ->whereIn('students.status', $updatableStudentStatuses)
            ->where('application_forms.status', 'Confirmed')
            ->update(['enrollments.status' => 'ACTIVE']);

        // Update INACTIVE
        $inactiveUpdated = \App\Models\Enrollment::query()
            ->where('enrollments.school_year_id', '!=', $currentId)
            ->join('students', 'enrollments.id', '=', 'students.id')
            ->whereIn('students.status', $updatableStudentStatuses)
            ->update(['enrollments.status' => 'INACTIVE']);

        $activeCount = Enrollment::where('status', 'ACTIVE')->count();
        $inactiveCount = Enrollment::where('status', 'INACTIVE')->count();

        $this->info("Enrollment status updated successfully.");
        $this->info("Total records updated: " . ($activeUpdated + $inactiveUpdated));
        $this->info("Current school year: {$schoolYearStr} (ID: {$currentId})");
        $this->info("ACTIVE: {$activeCount} | INACTIVE: {$inactiveCount}");
        $this->info("Withdrawn after a cancelled re-registration: {$withdrawn}");

        return 0;
    }

    /**
     * Sets to Withdraw the active students whose registration for $schoolYear was cancelled
     * and who have no confirmed registration for it. Returns how many were changed.
     */
    private function withdrawStudentsWithCancelledReRegistration(SchoolYear $schoolYear): int
    {
        $yearId = $schoolYear->school_year_id;

        $students = Student::where('active', 'YES')
            ->where('status', 'Not Graduate')
            ->whereHas('enrollments', function ($q) use ($yearId) {
                $q->where('school_year_id', $yearId)
                    ->whereHas('applicationForm', fn ($a) => $a->where('status', 'Cancelled'));
            })
            ->whereDoesntHave('enrollments', function ($q) use ($yearId) {
                $q->where('school_year_id', $yearId)
                    ->whereHas('applicationForm', fn ($a) => $a->where('status', 'Confirmed'));
            })
            ->get();

        $audit = app(AuditTrailService::class);

        foreach ($students as $student) {
            DB::transaction(function () use ($student) {
                $student->status = 'Withdraw';
                $student->active = 'NO';
                $student->updated_at = now();
                $student->save();

                Enrollment::where('id', $student->id)->where('status', 'ACTIVE')->update(['status' => 'INACTIVE']);
            });

            $audit->log('auto_withdraw', [
                'student_id'  => $student->student_id,
                'school_year' => $schoolYear->year,
                'changes'     => [
                    'status' => ['from' => 'Not Graduate', 'to' => 'Withdraw'],
                    'active' => ['from' => 'YES', 'to' => 'NO'],
                ],
                'description' => "Re-registration for {$schoolYear->year} was cancelled; set to Withdraw when the school year started.",
            ]);

            StudentStatusUpdated::dispatch($student);
        }

        return $students->count();
    }
}
