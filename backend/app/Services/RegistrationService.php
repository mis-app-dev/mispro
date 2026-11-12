<?php

namespace App\Services;

use Exception;
use Carbon\Carbon;
use App\Models\Draft;
use App\Models\Major;
use App\Models\Payment;
use App\Models\Program;
use App\Models\Section;
use App\Models\Student;
use App\Models\Guardian;
use App\Models\Enrollment;
use App\Models\SchoolYear;
use App\Models\StudentOld;
use App\Models\PickupPoint;
use App\Models\SchoolClass;
use Illuminate\Support\Str;
use App\Models\DiscountType;
use App\Models\FatherAddress;
use App\Models\MotherAddress;
use App\Models\ResidenceHall;
use App\Models\StudentAddress;
use App\Models\Transportation;
use App\Models\ApplicationForm;
use App\Models\StudentGuardian;
use Illuminate\Support\Facades\DB;
use App\Services\AuditTrailService;
use App\Helpers\SchoolYearHelper;
use Illuminate\Support\Facades\Log;
use App\Events\StudentStatusUpdated;
use App\Models\CancelledRegistration;
use App\Events\ApplicationFormCreated;
use App\Models\ApplicationFormVersion;
use App\Events\ApplicationFormStatusUpdated;

class RegistrationService 
{
    protected $auditTrail;

    public function __construct(AuditTrailService $auditTrail)
    {
        $this->auditTrail = $auditTrail;
    }

    // Registration
    public function createRegistrationDraft(array $validatedData, $userId)
    {
        $uuid = Str::uuid();

        $draft = Draft::create([
            'draft_id' => $uuid,
            'user_id' => $userId,
            'school_year_id' => $validatedData['school_year_id'],
            'semester_id' => $validatedData['semester_id'],
            'registration_date_draft' => now(),
        ]);

        return [
            'draft_id' => $uuid, 
            'school_year_id' => $validatedData['school_year_id'],
            'semester_id' => $validatedData['semester_id'],
            'registration_date' => $draft->registration_date_draft,
        ];
    }

    public function getRegistrationContext($draft_id, $userId)
    {
        return Draft::where('draft_id', $draft_id)
            ->where('user_id', $userId)
            ->first();
    }

    public function registerStudent(array $validated, $draft_id, $userId, $source = null)
    {
        \Log::info('Registration store called', [
            'draft_id' => $draft_id,
            'user_id' => $userId,
            'source' => $source,
            'student_status' => $validated['student_status'] ?? null,
            'student_id' => $validated['student_id'] ?? null,
        ]);

        DB::beginTransaction();
        try {
            $draft = $this->getRegistrationContext($draft_id, $userId);
            
            if (!$draft) {
                throw new Exception('Draft not found or unauthorized access.', 404);
            }

            if (empty($validated['program_id']) && !empty($validated['program_other'])) {
                $program = Program::create([
                    'name' => $validated['program_other'],
                ]);
                $validated['program_id'] = $program->program_id;
            }
            
            $program = Program::findOrFail($validated['program_id']);
            $schoolClass = SchoolClass::findOrFail($validated['class_id']);
            $major = Major::findOrFail($validated['major_id']);
            $section = Section::findOrFail($validated['section_id']);

            $transportation = null;
            if (!empty($validated['transportation_id'])) {
                $transportation = Transportation::findOrFail($validated['transportation_id']);
            }

            $residenceHall = ResidenceHall::findOrFail($validated['residence_id']);

            $pickupPoint = null;
            if ($validated['pickup_point_id']) {
                $pickupPoint = PickupPoint::findOrFail($validated['pickup_point_id']);
            } elseif ($validated['pickup_point_custom']) {
                $pickupPoint = PickupPoint::firstOrCreate([
                    'name' => $validated['pickup_point_custom'],
                ]);
            }

            // registration id
            $number = $this->getSectionRegistrationNumber($validated['section_id'], $draft->registration_date_draft);
            $registrationId = $this->formatRegistrationId(
                $number,
                $validated['section_id'],
                $draft->registration_date_draft
            );
            
            $status = $validated['student_status'];
            $student = null;
            $nextVersion = 1;

            // check current school year
            $currentMonth = now()->month;
            $currentYear = now()->year;
            $schoolYearStr = ($currentMonth >= 7) 
                ? $currentYear . '/' . ($currentYear + 1)
                : ($currentYear - 1) . '/' . $currentYear;

            $currentSchoolYear = SchoolYear::where('year', $schoolYearStr)->first();
            $enrollmentStatus = ($draft->school_year_id === $currentSchoolYear->school_year_id) ? 'ACTIVE' : 'INACTIVE';

            if ($status === 'Old' && !in_array($source, ['new', 'old'])) {
                throw new Exception('Invalid source for Old student. Must be "new" or "old".', 422);
            }

            if ($status === 'New' || $status === 'Transferee') {
                // Check existing student
                $studentExists  = Student::where(function($query) use ($validated) {
                    $query->where(function($q) use ($validated) {
                        // 1. Nama/TTL
                        $q->where('first_name', $validated['first_name'])
                        ->where('last_name', $validated['last_name'])
                        ->where('date_of_birth', $validated['date_of_birth'])
                        ->where('place_of_birth', $validated['place_of_birth']);
                    })
                    ->orWhere(function($q) use ($validated) {
                            // 2. NIK
                            if (!empty($validated['nik'])) {
                                $q->where('nik', $validated['nik']);
                            }
                    })
                    ->orWhere(function($q) use ($validated) {
                        // 3. KITAS
                        if (!empty($validated['kitas'])) {
                            $q->where('kitas', $validated['kitas']);
                        }
                    });
                })
                ->whereHas('enrollments', function ($query) use ($validated) {
                    $query->where('section_id', $validated['section_id']);
                })
                ->exists(); 
                
                if ($studentExists) {
                    throw new Exception('Student already exists in this section (any semester), please select Old status', 422);
                }
                
                // Generate new student ID
                $generatedId = $this->generateStudentId(
                    $draft->school_year_id,  
                    $validated['section_id'], 
                );
                
                // Create new student
                $student = Student::create([
                    'student_id' => $generatedId,
                    'studentall_id' => $generatedId,
                    'first_name' => $validated['first_name'],
                    'middle_name' => $validated['middle_name'],
                    'last_name' => $validated['last_name'],
                    'nickname' => $validated['nickname'],
                    'gender' => $validated['gender'],
                    'age' => $validated['age'] ?: $this->calculateAge($validated['date_of_birth']),
                    'family_rank' => $validated['family_rank'],
                    'citizenship' => $validated['citizenship'],
                    'country' => $validated['citizenship'] === 'Non Indonesia' ? $validated['country'] : 'Indonesia',
                    'religion' => $validated['religion'],
                    'place_of_birth' => $validated['place_of_birth'],
                    'date_of_birth' => $validated['date_of_birth'],
                    'email' => $validated['email'],
                    'previous_school' => $validated['previous_school'],
                    'phone_number' => $validated['phone_number'],
                    'academic_status' => $validated['academic_status'],
                    'academic_status_other' => $validated['academic_status'] === 'OTHER' ? $validated['academic_status_other'] : null,
                    'registration_date' => $draft->registration_date_draft,
                    'active' => 'YES',
                    'status' => 'Not Graduate',
                    'nik' => $validated['nik'],
                    'kitas' => $validated['kitas'],
                    'nisn' => $validated['nisn'],
                    'va_mandiri' => $validated['va_mandiri'],
                    'va_bca' => $validated['va_bca'],
                    'va_bni' => $validated['va_bni'],
                    'va_bri' => $validated['va_bri'],
                ]);

                $enrollment = $student->enrollments()->create([
                    'registration_date' => $draft->registration_date_draft,
                    'registration_id' => $registrationId,
                    'version' => $nextVersion,
                    'class_id' => $schoolClass->class_id,
                    'section_id' => $section->section_id,
                    'major_id' => $major->major_id,
                    'semester_id' => $draft->semester_id,
                    'school_year_id' => $draft->school_year_id,
                    'program_id' => $program->program_id,
                    'transport_id' => $transportation ? $transportation->transport_id : null,
                    'pickup_point_id' => $pickupPoint ? $pickupPoint->pickup_point_id : null,
                    'residence_id' => $residenceHall->residence_id,
                    'residence_hall_policy' => $validated['residence_hall_policy'], 
                    'transportation_policy' => $validated['transportation_policy'],
                    'status' => $enrollmentStatus,
                    'student_status' => $validated['student_status'],
                ])->refresh()->load('semester', 'schoolYear');
                
                // Create application form
                $applicationForm = $this->createApplicationForm($enrollment);
                $applicationForm->load('enrollment.schoolYear'); 
                ApplicationFormCreated::dispatch($applicationForm);

                // Create application form version
                $applicationFormVersion = $this->createApplicationFormVersion($applicationForm, $validated, $student, $enrollment);

                // Create student address, parent, guardian for new student
                $this->createStudentRelatedData($student, $validated, $enrollment);
                
            } else if ($status === 'Old') {
                $existingStudentId = $validated['input_name'];

                if (!$existingStudentId) {
                    throw new Exception('Student ID is required for Old student', 422);
                }
                
                if ($source === 'new') {
                    $student = Student::find($existingStudentId);
                    if (!$student) {
                        throw new Exception('Student not found', 404);
                    }

                    $sameSection = $student->enrollments()
                        ->where('section_id', $validated['section_id'])
                        ->exists();

                    if (!$sameSection) {
                        throw new Exception('For different section, please register as New Student.', 422);
                    }

                    $latestEnrollment = $student->enrollments()
                        ->orderBy('version', 'desc')
                        ->first();

                    $nextVersion = ($latestEnrollment ? $latestEnrollment->version : 0) + 1;

                    $enrollment = $student->enrollments()->create([
                        'registration_date' => $draft->registration_date_draft,
                        'registration_id' => $registrationId,
                        'version' => $nextVersion,
                        'class_id' => $schoolClass->class_id,
                        'section_id' => $section->section_id,
                        'major_id' => $major->major_id,
                        'semester_id' => $draft->semester_id,
                        'school_year_id' => $draft->school_year_id,
                        'program_id' => $program->program_id,
                        'transport_id' => $transportation ? $transportation->transport_id : null,
                        'pickup_point_id' => $pickupPoint ? $pickupPoint->pickup_point_id : null,
                        'residence_id' => $residenceHall->residence_id,
                        'residence_hall_policy' => $validated['residence_hall_policy'], 
                        'transportation_policy' => $validated['transportation_policy'],
                        'status' => $enrollmentStatus,
                        'student_status' => 'Old',
                    ])->refresh()->load('semester', 'schoolYear');

                    // Create application form
                    $applicationForm = $this->createApplicationForm($enrollment);
                    $applicationForm->load('enrollment.schoolYear'); 
                    ApplicationFormCreated::dispatch($applicationForm);

                    // Create application form version
                    $applicationFormVersion = $this->createApplicationFormVersion($applicationForm, $validated, $student, $enrollment);

                    if ($student->status !== 'Graduate') {
                        $student->active = 'YES';
                        $student->status = 'Not Graduate';
                        $student->save();
                    }

                    $student->load('studentParent');

                    $this->updateStudentData($student, $validated, $registrationId, $draft);
                    
                    $this->updateStudentRelatedData($student, $validated, $enrollment);
                } else if ($source === 'old') {
                    $oldStudent = StudentOld::find($existingStudentId);
                    if (!$oldStudent) {
                        throw new Exception('Old student data not found', 404);
                    }

                    if ($oldStudent->studentold_id && Student::where('student_id', $oldStudent->studentold_id)->exists()) {
                        throw new Exception('This student already has a record in the current database. Please select the student from the current student list instead of the old database.', 422);
                    }

                    $generatedId = $this->generateStudentId(
                        $draft->school_year_id,  
                        $validated['section_id'], 
                    );

                    $student = Student::create([
                        'student_id' => $oldStudent->studentold_id ?? null,
                        'studentall_id' => $generatedId,
                        'first_name' => $validated['first_name'] ?? $oldStudent->first_name,
                        'middle_name' => $validated['middle_name'] ?? null,
                        'last_name' => $validated['last_name'] ?? null,
                        'nickname' => $validated['nickname'] ?? $oldStudent->nickname,
                        'gender' => $validated['gender'] ?? strtoupper($oldStudent->gender),
                        'age' => $validated['age'] ?: $this->calculateAge($validated['date_of_birth']),
                        'family_rank' => $validated['family_rank'] ?? '',
                        'citizenship' => $validated['citizenship'] ?? 'Indonesia',
                        'country' => $validated['citizenship'] === 'Non Indonesia' ? $validated['country'] : 'Indonesia',
                        'religion' => $validated['religion'] ?? $oldStudent->religion,
                        'place_of_birth' => $validated['place_of_birth'] ?? $oldStudent->place_of_birth,
                        'date_of_birth' => $validated['date_of_birth'] ?? $oldStudent->date_of_birth,
                        'email' => $validated['email'] ?? $oldStudent->student_email,
                        'previous_school' => $validated['previous_school'] ?? $oldStudent->previous_school,
                        'phone_number' => $validated['phone_number'] ?? $oldStudent->student_phone,
                        'academic_status' => $validated['academic_status'],
                        'academic_status_other' => $validated['academic_status_other'] ?? null,
                        'registration_date' => $draft->registration_date_draft,
                        'active' => 'YES',
                        'status' => 'Not Graduate',
                        'nik' => $validated['nik'] ?? $oldStudent->nik,
                        'nisn' => $validated['nisn'] ?? $oldStudent->nisn,
                        'va_mandiri' => $validated['va_mandiri'],
                        'va_bca' => $validated['va_bca'],
                        'va_bni' => $validated['va_bni'],
                        'va_bri' => $validated['va_bri'],
                    ]);

                    $nextVersion = 1; 

                    $enrollment = $student->enrollments()->create([
                        'registration_date' => $draft->registration_date_draft,
                        'registration_id' => $registrationId,
                        'version' => $nextVersion,
                        'class_id' => $schoolClass->class_id,
                        'section_id' => $section->section_id,
                        'major_id' => $major->major_id,
                        'semester_id' => $draft->semester_id,
                        'school_year_id' => $draft->school_year_id,
                        'program_id' => $program->program_id,
                        'transport_id' => $transportation ? $transportation->transport_id : null,
                        'pickup_point_id' => $pickupPoint ? $pickupPoint->pickup_point_id : null,
                        'residence_id' => $residenceHall->residence_id,
                        'residence_hall_policy' => $validated['residence_hall_policy'], 
                        'transportation_policy' => $validated['transportation_policy'],
                        'status' => $enrollmentStatus,
                        'student_status' => 'Old',
                    ])->refresh()->load('semester', 'schoolYear');

                    $applicationForm = $this->createApplicationForm($enrollment);
                    $applicationForm->load('enrollment.schoolYear'); 
                    ApplicationFormCreated::dispatch($applicationForm);

                    $applicationFormVersion = $this->createApplicationFormVersion($applicationForm, $validated, $student, $enrollment);

                    $this->createStudentRelatedData($student, $validated, $enrollment);
                }
                
            }
            
            // Clear draft
            $draft->delete();
            
            $this->auditTrail->log('registration', [
                'student_id' => $student->student_id,
                'changes'    => $validated,
            ]);
            
            DB::commit();
            
            return [
                'student_id' => $student->student_id,
                'registration_id' => $registrationId,
                'application_id' => $applicationForm->application_id,
                'version' => $applicationFormVersion->version_id,
            ];
            
        } catch (\Exception $e) {
            DB::rollback();
            throw $e;
        }
    }

    // Preview
    public function getPreviewData($applicationId, $versionId)
    {
        $version = ApplicationFormVersion::where('application_id', $applicationId)
            ->where('version_id', $versionId)
            ->firstOrFail();

        return json_decode($version->data_snapshot, true);
    }

    // Helper Method
    protected function generateStudentId($schoolYearId, $sectionId)
    {
        $cancelledRegistration = CancelledRegistration::where('school_year_id', $schoolYearId)
            ->where('section_id', $sectionId)
            ->where('is_use_student_id', false)
            ->orderBy('student_id') 
            ->lockForUpdate() 
            ->first();

        if ($cancelledRegistration) {
            $studentIdToUse = $cancelledRegistration->student_id;

            $cancelledRegistration->is_use_student_id = true;
            $cancelledRegistration->updated_at = now(); 
            $cancelledRegistration->save();

            \Log::info("Reusing cancelled/invalid student ID: {$studentIdToUse} for school_year_id: {$schoolYearId} and section_id: {$sectionId}");
            
            return $studentIdToUse;
        }

        $schoolYear = SchoolYear::findOrFail($schoolYearId);
        $startYear = explode('/', $schoolYear->year)[0]; 
        $yearCode = substr($startYear, -2);              

        $prefix = "{$yearCode}{$sectionId}";   

        $latest = Student::where('studentall_id', 'LIKE', "{$prefix}%")
            ->orderByDesc('studentall_id')
            ->lockForUpdate()
            ->value('studentall_id');

        if ($latest) {
            $lastNumber = (int)substr($latest, -4);
            $nextNumber = $lastNumber + 1;
        } else {
            $nextNumber = 1;
        }

        $number = str_pad($nextNumber, 4, '0', STR_PAD_LEFT);
        return "{$prefix}{$number}"; 
    }

    protected function getSectionRegistrationNumber($section_id, $registration_date)
    {
        $date = Carbon::parse($registration_date);
        $month = $date->month;
        $year = $date->year;

        $nextNumber  = DB::transaction(function () use ($section_id, $month, $year) {
            $lastRegistration = DB::table('enrollments')
                ->where('section_id', $section_id)
                ->whereMonth('registration_date', $month)
                ->whereYear('registration_date', $year)
                ->lockForUpdate() 
                ->orderBy('registration_id', 'desc')
                ->first(['registration_id']);

            $highestNumber = 0;

            if ($lastRegistration) {
                $parts = explode('/', $lastRegistration->registration_id);
                $currentNumber = (int) $parts[0]; 

                $highestNumber = $currentNumber;
            }

            return $highestNumber + 1;
        });

        return str_pad($nextNumber, 3, '0', STR_PAD_LEFT);
    }

    protected function formatRegistrationId($number, $section_id, $registration_date)
    {
        $sectionCodes = [
            1 => 'ECP',
            2 => 'ES',
            3 => 'MS',
            4 => 'HS',
        ];

        $romanMonths = [
            1 => 'I', 2 => 'II', 3 => 'III', 4 => 'IV', 5 => 'V', 6 => 'VI',
            7 => 'VII', 8 => 'VIII', 9 => 'IX', 10 => 'X', 11 => 'XI', 12 => 'XII'
        ];

        $date = Carbon::parse($registration_date);
        $month = $date->month;
        $year = $date->year;
        $yearShort = substr($year, -2);

        $sectionCode = $sectionCodes[$section_id] ?? 'XX';
        $romanMonth = $romanMonths[$month];

        return "{$number}/RF.No-{$sectionCode}/{$romanMonth}-{$yearShort}";
    }

    protected function calculateAge($dateOfBirth)
    {
        $dateOfBirth = Carbon::parse($dateOfBirth);
        $diff = $dateOfBirth->diff(Carbon::now());
        return "{$diff->y} years {$diff->m} months";
    }

    protected function createStudentRelatedData($student, $validated, $enrollment)
    {
        $student->studentAddress()->create([
            'street' => $validated['street'],
            'rt' => $validated['rt'],
            'rw' => $validated['rw'],
            'village' => $validated['village'],
            'district' => $validated['district'],
            'city_regency' => $validated['city_regency'],
            'province' => $validated['province'],
            'other' => $validated['other'],
            'enrollment_id' => $enrollment->enrollment_id,
        ]);
        
        $studentParent = $student->studentParent()->create([
            'father_name' => $validated['father_name'],
            'father_company' => $validated['father_company'],
            'father_occupation' => $validated['father_occupation'],
            'father_phone' => $validated['father_phone'],
            'father_email' => $validated['father_email'],
            'mother_name' => $validated['mother_name'],
            'mother_company' => $validated['mother_company'],
            'mother_occupation' => $validated['mother_occupation'],
            'mother_phone' => $validated['mother_phone'],
            'mother_email' => $validated['mother_email'],
            'enrollment_id' => $enrollment->enrollment_id,
        ]);
        
        $this->createParentAddresses($studentParent, $validated, $enrollment);
        $this->createGuardianData($student, $validated, $enrollment);
        $this->createPayment($student, $validated, $enrollment);
    }

    protected function createParentAddresses($studentParent, $validated, $enrollment)
    {
        $studentParent->fatherAddress()->create([
            'street' => $validated['father_address_street'],
            'rt' => $validated['father_address_rt'],
            'rw' => $validated['father_address_rw'],
            'village' => $validated['father_address_village'],
            'district' => $validated['father_address_district'],
            'city_regency' => $validated['father_address_city_regency'],
            'province' => $validated['father_address_province'],
            'other' => $validated['father_address_other'],
            'enrollment_id' => $enrollment->enrollment_id,
        ]);
        $studentParent->motherAddress()->create([
            'street' => $validated['mother_address_street'],
            'rt' => $validated['mother_address_rt'],
            'rw' => $validated['mother_address_rw'],
            'village' => $validated['mother_address_village'],
            'district' => $validated['mother_address_district'],
            'city_regency' => $validated['mother_address_city_regency'],
            'province' => $validated['mother_address_province'],
            'other' => $validated['mother_address_other'],
            'enrollment_id' => $enrollment->enrollment_id,
        ]);
    }

    protected function createGuardianData($student, $validated, $enrollment)
    {
        $guardian = Guardian::create([
            'guardian_name' => $validated['guardian_name'],
            'relation_to_student' => $validated['relation_to_student'],
            'phone_number' => $validated['guardian_phone'],
            'guardian_email' => $validated['guardian_email'],
        ]);
        $studentGuardian = $student->studentGuardian()->create([
            'guardian_id' => $guardian->guardian_id,
            'enrollment_id' => $enrollment->enrollment_id,
        ]);
        $guardian->guardianAddress()->create([
            'street' => $validated['guardian_address_street'],
            'rt' => $validated['guardian_address_rt'],
            'rw' => $validated['guardian_address_rw'],
            'village' => $validated['guardian_address_village'],
            'district' => $validated['guardian_address_district'],
            'city_regency' => $validated['guardian_address_city_regency'],
            'province' => $validated['guardian_address_province'],
            'other' => $validated['guardian_address_other'],
        ]);
    }

    protected function createPayment($student, $validated, $enrollment)
    {
        Payment::create([
            'id' => $student->id,
            'enrollment_id'=> $enrollment->enrollment_id,
            'tuition_fees' => $validated['tuition_fees'],
            'residence_payment' => $validated['residence_payment'],
            'financial_policy_contract' => $validated['financial_policy_contract'],
        ]);

        if ($validated['discount_name']) {
            $discountType = DiscountType::firstOrCreate(['name' => $validated['discount_name']]);
            $enrollment->studentDiscount()->create([
                'enrollment_id' => $enrollment->enrollment_id,
                'discount_type_id' => $discountType->discount_type_id,
                'notes' => $validated['discount_notes'],
            ]);
        }  
    }

    protected function updateStudentData($student, $validated, $registrationId, $draft)
    {
        $student->update([
            'first_name' => $validated['first_name'],
            'middle_name' => $validated['middle_name'],
            'last_name' => $validated['last_name'],
            'nickname' => $validated['nickname'],
            'gender' => $validated['gender'],
            'age' => $validated['age'] ?: $this->calculateAge($validated['date_of_birth']),
            'family_rank' => $validated['family_rank'],
            'citizenship' => $validated['citizenship'],
            'country' => $validated['citizenship'] === 'Non Indonesia' ? $validated['country'] : 'Indonesia',
            'religion' => $validated['religion'],
            'place_of_birth' => $validated['place_of_birth'],
            'date_of_birth' => $validated['date_of_birth'],
            'email' => $validated['email'],
            'previous_school' => $validated['previous_school'],
            'phone_number' => $validated['phone_number'],
            'academic_status' => $validated['academic_status'],
            'academic_status_other' => $validated['academic_status'] === 'OTHER' ? $validated['academic_status_other'] : null,
            'status' => 'Not Graduate',
            'active' => 'YES',
            'nik' => $validated['nik'],
            'kitas' => $validated['kitas'],
            'nisn' => $validated['nisn'],
            'updated_at' => now(),
            'va_mandiri' => $validated['va_mandiri'],
            'va_bca' => $validated['va_bca'],
            'va_bni' => $validated['va_bni'],
            'va_bri' => $validated['va_bri'],
        ]);
    }

    protected function updateStudentRelatedData($student, $validated, $enrollment)
    {
        $student->studentAddress()->updateOrCreate(
            [
                'id' => $student->id,
                'enrollment_id' => $enrollment->enrollment_id,
            ],
            [
                'street' => $validated['street'],
                'rt' => $validated['rt'],
                'rw' => $validated['rw'],
                'village' => $validated['village'],
                'district' => $validated['district'],
                'city_regency' => $validated['city_regency'],
                'province' => $validated['province'],
                'other' => $validated['other'],
            ]
        );
        
        // Keep the parent row of THIS enrollment: the parent addresses must be attached to it.
        $studentParent = $student->studentParent()->updateOrCreate(
            [
                'id' => $student->id,
                'enrollment_id' => $enrollment->enrollment_id, 
            ],
            [
                'father_name' => $validated['father_name'],
                'father_company' => $validated['father_company'],
                'father_occupation' => $validated['father_occupation'],
                'father_phone' => $validated['father_phone'],
                'father_email' => $validated['father_email'],
                'mother_name' => $validated['mother_name'],
                'mother_company' => $validated['mother_company'],
                'mother_occupation' => $validated['mother_occupation'],
                'mother_phone' => $validated['mother_phone'],
                'mother_email' => $validated['mother_email'],
            ]
        );
        
        $this->updateParentAddresses($studentParent, $validated, $enrollment);
        $this->updateGuardianData($student, $validated, $enrollment);
        $this->updatePayment($student, $validated, $enrollment);
    }

    /**
     * @param StudentParent $studentParent the parent row of $enrollment. Do not use
     *        $student->studentParent here: that relation returns the student's first parent
     *        row, which belongs to an earlier enrollment on a re-registration.
     */
    protected function updateParentAddresses($studentParent, $validated, $enrollment)
    {
        if ($studentParent) {
            $studentParent->fatherAddress()->updateOrCreate(
                [
                    'parent_id' => $studentParent->parent_id,
                    'enrollment_id' => $enrollment->enrollment_id,
                ],
                [
                    'street' => $validated['father_address_street'],
                    'rt' => $validated['father_address_rt'],
                    'rw' => $validated['father_address_rw'],
                    'village' => $validated['father_address_village'],
                    'district' => $validated['father_address_district'],
                    'city_regency' => $validated['father_address_city_regency'],
                    'province' => $validated['father_address_province'],
                    'other' => $validated['father_address_other'],
                ]
            );

            $studentParent->motherAddress()->updateOrCreate(
                [
                    'parent_id' => $studentParent->parent_id,
                    'enrollment_id' => $enrollment->enrollment_id,
                ],
                [
                    'street' => $validated['mother_address_street'],
                    'rt' => $validated['mother_address_rt'],
                    'rw' => $validated['mother_address_rw'],
                    'village' => $validated['mother_address_village'],
                    'district' => $validated['mother_address_district'],
                    'city_regency' => $validated['mother_address_city_regency'],
                    'province' => $validated['mother_address_province'],
                    'other' => $validated['mother_address_other'],
                ]
            );
        }
    }

    protected function updateGuardianData($student, $validated, $enrollment)
    {
        $guardian = Guardian::updateOrCreate(
            [
                'guardian_id' => $validated['guardian_id'] ?? null
            ],
            [
                'guardian_name' => $validated['guardian_name'],
                'relation_to_student' => $validated['relation_to_student'],
                'phone_number' => $validated['guardian_phone'],
                'guardian_email' => $validated['guardian_email'],
            ]
        );
        $studentGuardian = $student->studentGuardian()->updateOrCreate(
            [
                'id' => $student->id,
                'guardian_id' => $guardian->guardian_id,
                'enrollment_id' => $enrollment->enrollment_id,
            ]
        );
        $guardian->guardianAddress()->updateOrCreate(
            [
                'guardian_id' => $guardian->guardian_id,
            ],
            [
            'street' => $validated['guardian_address_street'],
            'rt' => $validated['guardian_address_rt'],
            'rw' => $validated['guardian_address_rw'],
            'village' => $validated['guardian_address_village'],
            'district' => $validated['guardian_address_district'],
            'city_regency' => $validated['guardian_address_city_regency'],
            'province' => $validated['guardian_address_province'],
            'other' => $validated['guardian_address_other'],
        ]);
    }

    protected function updatePayment($student, $validated, $enrollment)
    {
        Payment::updateOrCreate(
        [
            'id' => $student->id,
            'enrollment_id' => $enrollment->enrollment_id,
        ],
        [
            'id' => $student->id,
            'enrollment_id'=> $enrollment->enrollment_id,
            'tuition_fees' => $validated['tuition_fees'],
            'residence_payment' => $validated['residence_payment'],
            'financial_policy_contract' => $validated['financial_policy_contract'],
        ]);

        if ($validated['discount_name']) {
            $discountType = DiscountType::updateOrCreate(['name' => $validated['discount_name']]);
            $enrollment->studentDiscount()->updateOrCreate(
                [
                    'enrollment_id' => $enrollment->enrollment_id,
                ],
                [
                    'discount_type_id' => $discountType->discount_type_id,
                    'notes' => $validated['discount_notes'],
                ]
            );
        }
    }

    protected function createApplicationForm($enrollment)
    {
        return ApplicationForm::create([
            'enrollment_id' => $enrollment->enrollment_id,
            'status' => 'Confirmed',
            'submitted_at' => now(),
        ]);
    }

    protected function createApplicationFormVersion($applicationForm, $validated, $student, $enrollment)
    {
        $latestVersion = ApplicationFormVersion::whereHas('applicationForm.enrollment.student', function($q) use ($student) {
            $q->where('id', $student->id);
        })
        ->orderByDesc('version_id')
        ->first();

        $oldSnapshot = $latestVersion ? json_decode($latestVersion->data_snapshot, true) : [];
        $oldRequestData = $oldSnapshot['request_data'] ?? [];

        $maxRegistrationSnapshot = ApplicationFormVersion::select('data_snapshot')
            ->orderByDesc('application_id') 
            ->lockForUpdate() 
            ->first();

        $highestRegistrationNumber = 0;

        if ($maxRegistrationSnapshot) {
            $snapshot = json_decode($maxRegistrationSnapshot->data_snapshot, true);
            $highestRegistrationNumber = (int) ($snapshot['registration_number'] ?? 0);
        }
    
        $registrationNumber = $highestRegistrationNumber + 1;

        $newRequestData = array_merge($oldRequestData, $validated, [
            'student_active' => $student->active,          
            'status' => $student->status,
            'enrollment_status' => $enrollment->status,
            'application_form_status' => $applicationForm->status, 
            'school_year_id'          => $enrollment->school_year_id,
            'school_year'             => $enrollment->schoolYear->year,
        ]);

        unset($newRequestData['photo']);

        // The form sends an empty country for Indonesian students; the students table
        // already stores Indonesia, so the snapshot (shown on the profile) should too.
        if (($newRequestData['citizenship'] ?? null) === 'Indonesia' && trim((string) ($newRequestData['country'] ?? '')) === '') {
            $newRequestData['country'] = 'Indonesia';
        }

        if ($student->photo_path) {
            $newRequestData['photo_path'] = $student->photo_path;
            $newRequestData['photo_url']  = asset('storage/' . $student->photo_path);
        }

        $dataSnapshot = [
            'id' => $student->id,
            'student_id'     => $student->student_id,
            'studentall_id' => $student->studentall_id,
            'registration_id'=> $enrollment->registration_id,
            'enrollment_id'  => $enrollment->enrollment_id,
            'registration_number' => $registrationNumber,
            'registration_date'   => $enrollment->registration_date,
            'application_id' => $applicationForm->application_id,
            'semester'       => $enrollment->semester->number, 
            'school_year'    => $enrollment->schoolYear->year, 
            'request_data'   => $newRequestData,
            'timestamp'      => now(),
            'action'         => 'registration'
        ];

        $maxVersion = ApplicationFormVersion::where('application_id', $applicationForm->application_id)
            ->max('version');
        
        $nextVersion = $maxVersion ? $maxVersion + 1 : 1;
        $userName = auth()->user()->username ?? 'system';

        return ApplicationFormVersion::create([
            'application_id' => $applicationForm->application_id,
            'version'        => $nextVersion,
            'updated_by'     => $userName,
            'action'         => 'registration',
            'data_snapshot'  => json_encode($dataSnapshot, JSON_PRETTY_PRINT),
        ]);
    }

    protected function isLatestVersion(int $id, int $current_version): bool
    {
        $latestVersion = Enrollment::where('id', $id)->max('version');

        return $current_version === (int)$latestVersion;
    }

    protected function validateNewStudentConstraints($student, $enrollment_id, $isLatest, $isCancelled)
    {
        $hasOtherApplication = ApplicationForm::whereHas('enrollment.student', function ($query) use ($student, $enrollment_id) {
            $query->where('studentall_id', $student->studentall_id)
                    ->where('enrollment_id', '!=', $enrollment_id);
        })->exists();

        if (!$isLatest && $isCancelled) {
            throw new Exception('This registration cannot be processed. This student has already withdrawn.', 400);
        }
        
        if ($hasOtherApplication) {
            Log::warning('Attempted to invalidate/cancel NEW student registration with linked records', [
                'student_id' => $student->student_id, 
                'studentall_id' => $student->studentall_id,
                'enrollment_id' => $enrollment_id,
            ]);
            throw new Exception('This registration cannot be processed because it belongs to a NEW/TRANSFEREE student who has other registration data linked to this student.', 400);
        }
    }

    // Cancel Registration
    public function cancelRegistration($application_id, string $reason_type, $notes = null, $user_name = 'anonymous')
    {
        if (empty($application_id) || !in_array($reason_type, ['invalidData', 'cancellationOfEnrollment'])) {
            throw new Exception('Invalid application ID or reason type.', 400);
        }

        DB::beginTransaction();

        try {
            $applicationForm = ApplicationForm::with([
                'versions',
                'enrollment',
                'enrollment.student',
                'enrollment.student.studentParent', 
                'enrollment.student.studentGuardian.guardian.guardianAddress', 
                'enrollment.studentDiscount',
            ])->where('application_id', $application_id)->first();

            if (!$applicationForm) {
                throw new Exception('Application form not found.', 404);
            }

            $enrollment = $applicationForm->enrollment;
            $student = $enrollment?->student;

            if (!$enrollment || !$student) {
                throw new Exception('Enrollment or student not found.', 404);
            }

            $data = [
                'applicationForm' => $applicationForm,
                'enrollment' => $enrollment,
                'student' => $student,
                'oldStatus' => $applicationForm->status,
                'studentStatus' => strtolower($enrollment->student_status ?? ''),
                'enrollment_id' => $enrollment->enrollment_id,
                'current_version' => (int)$enrollment->version,
                'student_id_enrollment' => (int)$enrollment->id,
                'invalidReason' => 'Invalid Data',
                'cancellationReason' => 'Cancellation of Enrollment',
                'notes' => $notes,
                'isInactive' => strtoupper($student->active) === 'NO' && strtolower($student->status) !== 'not graduate',
            ];
            
            $data['isLatest'] = $this->isLatestVersion($data['student_id_enrollment'], $data['current_version']);
            
            $latestApplication = ApplicationForm::whereHas('enrollment.student', function ($query) use ($student) {
                $query->where('studentall_id', $student->studentall_id);
                })
                ->join('enrollments', 'application_forms.enrollment_id', '=', 'enrollments.enrollment_id')
                ->orderBy('enrollments.version', 'desc')
                ->select('application_forms.*') 
                ->first();
                
            $data['isCancelled'] = $latestApplication->status === 'Cancelled';
            
            $resultMessage = '';

            if ($reason_type === 'invalidData') {
                return $this->invalidDataCancellation($data);
            } else if ($reason_type === 'cancellationOfEnrollment') {
                return $this->enrollmentCancellation($data);
            } else {
                throw new Exception('Invalid reason type supplied.', 400);
            }
            
            return $resultMessage;

        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }
    }

    protected function invalidDataCancellation(array $data)
    {
        extract($data); 
        $notes = $data['notes'] ?? null; 

        if ($isInactive) {
            throw new Exception('Registration cannot be cancelled because the student is already inactive.', 400);
        }

        if ($studentStatus === 'new' || $studentStatus === 'transferee') {
            
            $this->validateNewStudentConstraints($student, $enrollment_id, $isLatest, $isCancelled);

            $this->saveToCancelledRegistration($student, $enrollment, $invalidReason, $notes);
            $this->deleteStudentAndRelatedData($applicationForm, $enrollment, $student, $enrollment_id, true);

            $newStatus = 'Deleted New/Transferee (Invalid Data)';
            
            $this->auditTrail->log('Invalidate Registration', [
                'category'          => 'Invalid Data (New/Transferee)',
                'application_id'    => $applicationForm->application_id,
                'student_name'      => "{$student->first_name} {$student->middle_name} {$student->last_name}",
                'student_id'        => $student->student_id,
                'enrollment_ver'    => $current_version,
                'reason'            => $invalidReason,
                'notes'             => $notes,
                'action_detail'     => 'Moved to Cancelled Registration table and deleted original data.',
                'data_changes'      => null,
            ]);

            DB::commit();
            
            ApplicationFormStatusUpdated::dispatch($applicationForm, $oldStatus, $newStatus);

            return 'Registration and related data deleted successfully (Invalid Data - NEW/TRANSFEREE).';

        } else if ($studentStatus === 'old') {

            $inOldDatabase = StudentOld::where('studentold_id', $student->student_id)->exists();
            
            if ($inOldDatabase) {
                if ($current_version === 1 && $isLatest) {
                    $this->saveToCancelledRegistration($student, $enrollment, $invalidReason, $notes);
                    $this->deleteStudentAndRelatedData($applicationForm, $enrollment, $student, $enrollment_id, true);

                    $newStatus = 'Deleted Old (Invalid Data)';

                    $this->auditTrail->log('Invalidate Registration', [
                        'category'          => 'Invalid Data (Old Student - Version 1)',
                        'application_id'    => $applicationForm->application_id,
                        'student_name'      => "{$student->first_name} {$student->middle_name} {$student->last_name}",
                        'student_id'        => $student->student_id,
                        'enrollment_ver'    => $current_version,
                        'reason'            => $invalidReason,
                        'notes'             => $notes,
                        'action_detail'     => 'Moved to Cancelled Registration table and deleted original data.',
                        'data_changes'      => null,
                    ]);

                    DB::commit();

                    ApplicationFormStatusUpdated::dispatch($applicationForm, $oldStatus, $newStatus);

                    return 'Registration and related data deleted successfully (Invalid Data - OLD, enrollment version = 1).';

                } else if ($current_version > 1 && $isLatest) { 
                    $this->deleteStudentAndRelatedData($applicationForm, $enrollment, $student, $enrollment_id, false);

                    $newStatus = 'Deleted Old (Invalid Data)';

                    $this->auditTrail->log('Invalidate Registration', [
                        'category'          => 'Invalid Data (Old Student - Latest Version)',
                        'application_id'    => $applicationForm->application_id,
                        'student_name'      => "{$student->first_name} {$student->middle_name} {$student->last_name}",
                        'student_id'        => $student->student_id,
                        'enrollment_ver'    => $current_version,
                        'reason'            => $invalidReason,
                        'notes'             => $notes,
                        'action_detail'     => 'Deleted registration records only.',
                        'data_changes'      => null,
                    ]);

                    DB::commit();

                    ApplicationFormStatusUpdated::dispatch($applicationForm, $oldStatus, $newStatus);

                    return 'Registration and related data deleted successfully, except student data (Invalid Data - OLD, latest enrollment version).';

                } else if (!$isLatest && $isCancelled) {
                    throw new Exception('This registration cannot be invalidated. The latest enrollment for this student is already cancelled.', 400);
                }
                
                throw new Exception('OLD student registration could not be invalidated (not latest enrollment version).', 400);

            } else if ($isLatest) {
                $this->deleteStudentAndRelatedData($applicationForm, $enrollment, $student, $enrollment_id, false);

                $newStatus = 'Deleted Old (Invalid Data)';
                
                $this->auditTrail->log('Invalidate Registration', [
                    'category'          => 'Invalid Data (Old Student - Latest Version)',
                    'application_id'    => $applicationForm->application_id,
                    'student_name'      => "{$student->first_name} {$student->middle_name} {$student->last_name}",
                    'student_id'        => $student->student_id,
                    'enrollment_ver'    => $current_version,
                    'reason'            => $invalidReason,
                    'notes'             => $notes,
                    'action_detail'     => 'Deleted registration records only.',
                    'data_changes'      => null,
                ]);

                DB::commit();

                ApplicationFormStatusUpdated::dispatch($applicationForm, $oldStatus, $newStatus);

                return 'Registration and related data deleted successfully, except student data (Invalid Data - OLD, latest enrollment version).';

            } else if (!$isLatest && $isCancelled) {
                throw new Exception('This registration cannot be invalidated. The latest enrollment for this student is already cancelled.', 400);
            }

            throw new Exception('OLD student registration could not be invalidated (not latest enrollment version).', 400);
            }
        throw new Exception('Invalid student status for cancellation.', 400);
    }

    protected function enrollmentCancellation(array $data)
    {
        extract($data); 
        $notes = $data['notes'] ?? null;
        
        if ($isInactive) {
            throw new Exception('Registration cannot be cancelled because the student is already inactive.', 400);
        }
        
        if ($studentStatus === 'new' || $studentStatus === 'transferee') {
            
            $this->validateNewStudentConstraints($student, $enrollment_id, $isLatest, $isCancelled);

            $this->saveToCancelledRegistration($student, $enrollment, $cancellationReason, $notes);
            $this->deleteStudentAndRelatedData($applicationForm, $enrollment, $student, $enrollment_id, true);

            $newStatus = 'Deleted New/Transferee (Cancelled)';

            $this->auditTrail->log('Cancel Enrollment', [
                'category'          => 'Cancellation (New/Transferee)',
                'application_id'    => $applicationForm->application_id,
                'student_name'      => "{$student->first_name} {$student->middle_name} {$student->last_name}",
                'student_id'        => $student->student_id,
                'enrollment_ver'    => $current_version,
                'reason'            => $cancellationReason,
                'notes'             => $notes,
                'action_detail'     => 'Moved to Cancelled Registration table and deleted original data.',
                'data_changes'      => null,
            ]);

            DB::commit();

            ApplicationFormStatusUpdated::dispatch($applicationForm, $oldStatus, $newStatus);

            return 'Registration and related data deleted successfully (Cancellation of Enrollment - NEW/TRANSFEREE).';

        } else if ($studentStatus === 'old') {

            // Cancelling only next year's re-registration: the student keeps attending the
            // current school year and is set to Withdraw when the next one starts (see the
            // update:enrollment-status command).
            if ($isLatest && $this->staysForCurrentYear($student, $enrollment)) {
                $applicationForm->notes = $notes;
                $applicationForm->status = 'Cancelled';
                $applicationForm->save();

                $enrollment->status = 'INACTIVE';
                $enrollment->save();

                $currentYear = SchoolYearHelper::current()?->year;
                $nextYear = $enrollment->schoolYear?->year;

                $this->auditTrail->log('Cancel Enrollment', [
                    'category'          => 'Cancellation (Old Student - Next Year Only)',
                    'application_id'    => $applicationForm->application_id,
                    'student_name'      => "{$student->first_name} {$student->middle_name} {$student->last_name}",
                    'student_id'        => $student->student_id,
                    'enrollment_ver'    => $current_version,
                    'reason'            => $cancellationReason,
                    'notes'             => $notes,
                    'action_detail'     => "Registration for {$nextYear} cancelled. Student stays active for {$currentYear} and is set to Withdraw when {$nextYear} starts.",
                    'data_changes'      => [
                        'application_status' => 'Cancelled',
                        'enrollment'         => 'INACTIVE',
                    ]
                ]);

                DB::commit();

                ApplicationFormStatusUpdated::dispatch($applicationForm, $oldStatus, 'Cancelled (next year only)');

                return "Registration for {$nextYear} cancelled. The student stays active for {$currentYear} and will be set to Withdraw when {$nextYear} starts.";
            }

            if ($isLatest) {
            $applicationForm->notes = $notes;
            $applicationForm->status = 'Cancelled';
            $applicationForm->save();
            
            $student->status = 'Withdraw';
            $student->active = 'NO';
            $student->save();

            $enrollment->status = 'INACTIVE';
            $enrollment->save();
            
            $newStatus = 'Deleted Old (Cancelled)';

            $this->auditTrail->log('Cancel Enrollment', [
                'category'          => 'Cancellation (Old Student - Withdraw)',
                'application_id'    => $applicationForm->application_id,
                'student_name'      => "{$student->first_name} {$student->middle_name} {$student->last_name}",
                'student_id'        => $student->student_id,
                'enrollment_ver'    => $current_version,
                'reason'            => $cancellationReason,
                'notes'             => $notes,
                'action_detail'     => 'Student status updated to Withdraw. Active set to NO.',
                'data_changes'      => [
                    'student_status'     => 'Withdraw',
                    'student_active'     => 'NO',
                    'application_status' => 'Cancelled',
                    'enrollment'         => 'INACTIVE'
                ]
            ]);

            DB::commit();

            ApplicationFormStatusUpdated::dispatch($applicationForm, $oldStatus, $newStatus);
            StudentStatusUpdated::dispatch($student);

            return 'Registration status updated successfully (Cancellation of Enrollment - Old, latest enrollment version).';
            } else if (!$isLatest && $isCancelled) {
                throw new Exception('This registration cannot be cancelled. The latest enrollment for this student is already cancelled.', 400); 
            }

            throw new Exception('OLD student registration could not be cancelled (Old, not latest enrollment version).', 400);
        }
        throw new Exception('Invalid student status for cancellation.', 400);
    }

    /**
     * True when $enrollment belongs to a later school year than the current one and the
     * student still has a confirmed enrollment in the current school year.
     */
    private function staysForCurrentYear($student, $enrollment): bool
    {
        $current = SchoolYearHelper::current();

        if (!$current || !SchoolYearHelper::isAfter($enrollment->school_year_id, $current)) {
            return false;
        }

        return strtolower((string) $student->status) === 'not graduate'
            && Enrollment::where('id', $student->id)
                ->where('school_year_id', $current->school_year_id)
                ->whereHas('applicationForm', fn ($q) => $q->where('status', 'Confirmed'))
                ->exists();
    }

    private function saveToCancelledRegistration($student, $enrollment, $reason, $notes)
    {
        CancelledRegistration::create([
            'student_id' => $student->studentall_id,
            'full_name' => trim("{$student->first_name} {$student->middle_name} {$student->last_name}"),
            'registration_id' => $enrollment->registration_id,
            'school_year_id' => $enrollment->school_year_id,
            'section_id' => $enrollment->section_id,
            'registration_date' => $enrollment->registration_date,
            'cancelled_by' => auth()->user()->username ?? 'anonymous', 
            'cancelled_at' => now(),
            'created_at' => now(),
            'is_use_student_id' => false,
            'reason' => $reason,
            'notes' => $notes,
            'student_status' => $enrollment->student_status,
        ]);
    }

    private function deleteStudentAndRelatedData($applicationForm, $enrollment, $student, $enrollment_id, bool $isAllData)
    {
        // Hapus versi formulir
        $applicationForm->versions()->delete();
        
        // Hapus discount
        $enrollment->studentDiscount()?->delete();
        
        // Hapus pembayaran yang terkait dengan pendaftaran ini
        $student->payments()->where('enrollment_id', $enrollment_id)->delete();
        
        // Hapus data parent yang terkait enrollment ini
        $student->studentParent()->where('enrollment_id', $enrollment_id)->delete();
        
        // Hapus alamat orang tua
        FatherAddress::where('enrollment_id', $enrollment_id)->delete();
        MotherAddress::where('enrollment_id', $enrollment_id)->delete();
        
        // === HAPUS STUDENT GUARDIAN DAN ALAMATNYA ===
        $studentGuardians = $student->studentGuardian()->where('enrollment_id', $enrollment_id)->get();
        foreach ($studentGuardians as $studentGuardian) {
            $guardian = $studentGuardian->guardian;
            if ($guardian) {
            $isGuardianUsedByOthers = StudentGuardian::where('guardian_id', $guardian->guardian_id)
                ->where('enrollment_id', '!=', $enrollment_id)
                ->exists();
            if (!$isGuardianUsedByOthers) {
                $guardian->guardianAddress()?->delete();
                $guardian->delete();
            }
            }
            $studentGuardian->delete();
        }
        StudentAddress::where('enrollment_id', $enrollment_id)->delete();
        
        // Hapus data utama
        $enrollment->delete();
        $applicationForm->delete();

        if ($isAllData) {
            $student->delete();
        }
    }
}
