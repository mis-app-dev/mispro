<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use App\Models\Payment;
use App\Models\Student;
use App\Models\Enrollment;
use App\Models\SchoolYear;
use App\Models\StudentOld;
use Illuminate\Http\Request;
use App\Models\StudentParent;
use App\Models\StudentAddress;
use App\Models\StudentDiscount;
use App\Models\StudentGuardian;
use App\Models\Guardian;
use App\Models\GuardianAddress;
use App\Models\FatherAddress;
use App\Models\MotherAddress;
use App\Models\PickupPoint;
use App\Models\ApplicationForm;
use App\Helpers\SchoolYearHelper;
use App\Events\ApplicationFormStatusUpdated;
use Illuminate\Support\Facades\DB;
use App\Services\AuditTrailService;
use Illuminate\Support\Facades\URL;
use App\Events\StudentStatusUpdated;
use Illuminate\Support\Facades\Log; 
use App\Models\ApplicationFormVersion;
use Illuminate\Support\Facades\Validator;

class StudentController extends Controller
{
    protected $auditTrail;

    public function __construct(AuditTrailService $auditTrail)
    {
        $this->auditTrail = $auditTrail;
    }

    /**
     * @param \Illuminate\Http\Request $request
     */
    public function index(Request $request)
    {
        if ($invalid = $this->invalidListQuery($request, ['search', 'search_name'], [], true)) {
            return $invalid;
        }

        try {
            $currentMonth = now()->month;
            $currentYear = now()->year;
            $schoolYearStr = ($currentMonth >= 7) 
                ? $currentYear . '/' . ($currentYear + 1)
                : ($currentYear - 1) . '/' . $currentYear;
            
            $schoolYear = SchoolYear::where('year', $schoolYearStr)->first();
            $defaultSchoolYearId = $schoolYear?->school_year_id;
    
            $targetSchoolYearId = $request->input('school_year_id', $defaultSchoolYearId);
    
            $isStudentStatusFiltered = $request->filled('student_status');
    
            $latestEnrollments = DB::table('enrollments as e1')
            ->select('e1.id', 'e1.enrollment_id')
            ->when(!$isStudentStatusFiltered, function ($query) use ($targetSchoolYearId) {
                $query->where('e1.school_year_id', $targetSchoolYearId);
            })
            ->whereRaw('e1.registration_date = (
                SELECT MAX(e2.registration_date)
                FROM enrollments AS e2
                WHERE e2.id = e1.id
                ' . (!$isStudentStatusFiltered ? 'AND e2.school_year_id = e1.school_year_id' : '') . '
            )');
    
            $latestApplicationVersionSub = DB::table('application_form_versions AS afv')
            ->select(
                'afv.application_id',
                'afv.data_snapshot'
            )
            ->join('application_forms AS af', 'af.application_id', '=', 'afv.application_id')
            ->whereRaw('afv.version_id = (
                SELECT MAX(afv2.version_id) 
                FROM application_form_versions AS afv2
                WHERE afv2.application_id = afv.application_id
            )');
    
            $query = Student::select(            
                'students.id',
                'students.student_id',
                DB::raw("CONCAT_WS(' ', students.first_name, students.middle_name, students.last_name) AS full_name"),
                'students.photo_path',
                'enrollments.section_id',
                'enrollments.class_id',
                'enrollments.school_year_id',
                'school_years.year as school_year',
                'classes.grade',
                'sections.name as section_name',
                'students.status as student_status',
                'enrollments.status as enrollment_status',
                'latest_app_version.data_snapshot as latest_data_snapshot'
            )
            ->joinSub($latestEnrollments, 'latest_enrollments', function ($join) {
                $join->on('latest_enrollments.id', '=', 'students.id');
            })
            ->join('enrollments', 'enrollments.enrollment_id', '=', 'latest_enrollments.enrollment_id')
            ->join('application_forms', 'application_forms.enrollment_id', '=', 'enrollments.enrollment_id')
            ->leftJoinSub($latestApplicationVersionSub, 'latest_app_version', function ($join) {
                $join->on('latest_app_version.application_id', '=', 'application_forms.application_id');
            })
            ->join('school_years', 'enrollments.school_year_id', '=', 'school_years.school_year_id')
            ->leftJoin('classes', 'enrollments.class_id', '=', 'classes.class_id')
            ->leftJoin('sections', 'enrollments.section_id', '=', 'sections.section_id');
            
            $isEnrollmentStatusFiltered = $request->filled('enrollment_status');
    
            if (!$isStudentStatusFiltered && !$isEnrollmentStatusFiltered) {
                $query->where('students.active', 'YES')
                    ->where('application_forms.status', 'Confirmed');
            }
    
            // Filter Search
            if ($search = trim($request->input('search', ''))) {
                $query->where(function ($q) use ($search) {
                    $search = strtolower($search);
                    $q->whereRaw('LOWER(students.student_id) LIKE ?', ["%{$search}%"])
                    ->orWhereRaw("LOWER(CONCAT_WS(' ', COALESCE(students.first_name,''), COALESCE(students.middle_name,''), COALESCE(students.last_name,''))) LIKE ?", ["%{$search}%"]);
                });
            } elseif ($request->filled('search_name')) {
                $searchName = strtolower(trim($request->input('search_name')));
                $query->whereRaw("LOWER(CONCAT_WS(' ', COALESCE(students.first_name,''), COALESCE(students.middle_name,''), COALESCE(students.last_name,''))) LIKE ?", ["%{$searchName}%"]);
            }
    
            // Filter checkbox
            if ($request->filled('class_id')) {
                $classIds = (array) $request->input('class_id');
                $query->whereIn('enrollments.class_id', $classIds);
            }
            if ($request->filled('section_id')) {
                $sectionIds = (array) $request->input('section_id');
                $query->whereIn('enrollments.section_id', $sectionIds);
            }
            if ($isEnrollmentStatusFiltered) {
                $enrollmentStatuses = (array) $request->input('enrollment_status');
                $query->whereIn('enrollments.status', $enrollmentStatuses);
            }
            if ($isStudentStatusFiltered) {
                $studentStatuses = (array) $request->input('student_status');
                $query->whereIn('students.status', $studentStatuses);
            }
            
            // Sort
            $sorts = $request->input('sort', []);
    
            $sortable = [
                'student_id' => 'students.student_id',
                'full_name' => "CONCAT_WS(' ', students.first_name, students.middle_name, students.last_name)",
                'grade' => 'classes.grade',
                'section' => 'sections.name',
                'enrollment_status' => 'enrollments.status',
                'student_status' => 'students.status',
            ];
            
            if (empty($sorts)) {
                $query->orderBy('students.first_name', 'asc');
            } else {
                foreach ($sorts as $sort) {
                    $field = $sort['field'] ?? null;
                    $order = strtolower($sort['order'] ?? 'asc') === 'desc' ? 'desc' : 'asc';
    
                    if (!$field || !array_key_exists($field, $sortable)) continue;
    
                    if ($field === 'full_name') {
                        $query->orderByRaw($sortable[$field] . ' ' . $order);
                    } else {
                        $query->orderBy($sortable[$field], $order);
                    }
                }
            }
    
            // Pagination
            $perPage = min(max((int) $request->input('per_page', 25), 1), 100);
            $students= $query->paginate($perPage);
    
            // Transform data (photo_url)
            $students->getCollection()->transform(function ($student) {
                $processedPhotoUrl = null;
                try {
                    $rawPhotoPath = null;

                    if ($student->latest_data_snapshot) {
                        $decode = json_decode($student->latest_data_snapshot);
                        $rawPhotoPath = $decode->request_data->photo_url ?? null;
                    } 

                    if ($rawPhotoPath) {
                        $pathOnly = parse_url($rawPhotoPath, PHP_URL_PATH) ?: $rawPhotoPath;

                        $pathOnly = ltrim($pathOnly, '/');
                        $cleanPath = preg_replace('/^storage\//', '', $pathOnly);

                        $processedPhotoUrl = URL::to("api/storage-file/{$cleanPath}");
                    }
    
                } catch (\Exception $e) {
                    Log::warning('Transform Photo Error for Student ID: ' . $student->id);
                }
    
                $student->photo_url = $processedPhotoUrl;
                unset($student->latest_data_snapshot);
    
                return $student;
            });
            
            return response()->json([
                'success' => true,
                'data' => $students,
                'meta' => [
                    'current_page' => $students->currentPage(),
                    'last_page' => $students->lastPage(),
                    'per_page' => $students->perPage(),
                    'total' => $students->total(),
                ]
            ]);

        } catch (\Exception $e) {
            Log::error('Student Index Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve student list.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /** Grades whose students leave their level (ECP, ES, MS, HS) at the end of the year. */
    private const GRADUATING_GRADES = ['K2', '6', '9', '12'];

    private function currentSchoolYear(): ?SchoolYear
    {
        $month = now()->month;
        $year = now()->year;
        $name = ($month >= 7) ? $year . '/' . ($year + 1) : ($year - 1) . '/' . $year;

        return SchoolYear::where('year', $name)->first();
    }

    /**
     * Students that may be graduated: active, and whose latest enrollment of the current
     * school year is in one of GRADUATING_GRADES. Used by both preview and confirm, so the
     * confirm step cannot graduate anyone the preview would not list.
     */
    private function graduationCandidatesQuery(int $schoolYearId)
    {
        $latestEnrollments = DB::table('enrollments as e1')
            ->select('e1.id', 'e1.enrollment_id')
            ->where('e1.school_year_id', $schoolYearId)
            ->whereRaw('e1.registration_date = (
                SELECT MAX(e2.registration_date)
                FROM enrollments AS e2
                WHERE e2.id = e1.id
                AND e2.school_year_id = e1.school_year_id
            )');

        return Student::select(
                'students.id',
                'students.student_id',
                DB::raw("CONCAT_WS(' ', students.first_name, students.middle_name, students.last_name) AS full_name"),
                'classes.grade',
                'sections.name AS section_name',
                'sections.section_id',
                'school_years.year AS school_year',
                'students.status',
                'students.active',
                'enrollments.status AS enrollment_status'
            )
            ->joinSub($latestEnrollments, 'latest_enrollments', function ($join) {
                $join->on('latest_enrollments.id', '=', 'students.id');
            })
            ->join('enrollments', 'enrollments.enrollment_id', '=', 'latest_enrollments.enrollment_id')
            ->join('school_years', 'school_years.school_year_id', '=', 'enrollments.school_year_id')
            ->leftJoin('classes', 'classes.class_id', '=', 'enrollments.class_id')
            ->leftJoin('sections', 'sections.section_id', '=', 'enrollments.section_id')
            ->whereIn('classes.grade', self::GRADUATING_GRADES)
            ->where('students.active', 'YES')
            ->where('school_years.school_year_id', $schoolYearId);
    }

    public function autoGraduatePreview(Request $request)
    {
        try {
            $currentSchoolYear = $this->currentSchoolYear();

            if (!$currentSchoolYear) {
                return response()->json([
                    'success' => false,
                    'message' => 'Current school year is not defined.'
                ], 400);
            }

            $students = $this->graduationCandidatesQuery($currentSchoolYear->school_year_id)
                ->orderBy('sections.section_id', 'asc')
                ->orderBy('classes.grade', 'asc')
                ->orderBy('students.first_name', 'asc')
                ->get();

            return response()->json([
                'success' => true,
                'current_school_year' => $currentSchoolYear->year,
                'total_students' => $students->count(),
                'students' => $students
            ]);

        } catch (\Exception $e) {
            Log::error('Auto Graduate Preview Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to generate auto-graduate preview.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function autoGraduateConfirm(Request $request)
    {
        $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:students,id'
        ]);

        try {
            $currentSchoolYear = $this->currentSchoolYear();

            if (!$currentSchoolYear) {
                return response()->json([
                    'success' => false,
                    'message' => 'Current school year is not defined.'
                ], 400);
            }

            $ids = array_values(array_unique(array_map('intval', $request->ids)));

            // Re-check every selected student on the server; never trust the list sent by
            // the client. If any of them is not eligible, nothing is changed.
            $students = $this->graduationCandidatesQuery($currentSchoolYear->school_year_id)
                ->whereIn('students.id', $ids)
                ->get();

            $eligibleIds = $students->pluck('id')->map(fn ($id) => (int) $id)->all();
            $notEligible = array_values(array_diff($ids, $eligibleIds));

            if (!empty($notEligible)) {
                $numbers = Student::whereIn('id', $notEligible)->pluck('student_id')->implode(', ');

                return response()->json([
                    'success' => false,
                    'message' => 'Nothing was changed. These students are not active in grade '
                        . implode(', ', self::GRADUATING_GRADES) . ' in S.Y. ' . $currentSchoolYear->year
                        . ' and cannot be graduated: ' . $numbers,
                    'not_eligible' => $notEligible,
                ], 422);
            }

            $studentDataList = [];
            foreach ($students->values() as $index => $student) {
                $studentDataList[] = ($index + 1) . ". {$student->full_name} (student id: {$student->student_id}) (grade: {$student->grade})";
            }

            $schoolYearLog = $currentSchoolYear->year;

            DB::transaction(function () use ($ids, $studentDataList, $schoolYearLog) {

                Student::whereIn('id', $ids)
                    ->update([
                        'status' => 'Graduate',
                        'active' => 'NO',
                        'graduated_at' => now(),
                        'updated_at' => now(),
                ]);

                Enrollment::whereIn('id', $ids)
                    ->where('status', 'ACTIVE')
                    ->update([
                        'status' => 'INACTIVE'
                ]);

                $this->auditTrail->log('auto_graduate', [
                    'school_year'  => $schoolYearLog,
                    'student_data' => $studentDataList,
                    'changes'      => [
                        'status' => [
                            'from' => 'Not Graduate',
                            'to'   => 'Graduate'
                        ],
                        'active' => [
                            'from' => 'YES',
                            'to'   => 'NO'
                        ],
                        'graduated_at' => now()->toDateTimeString()
                    ],
                    'description'  => 'Student automatically graduated via Bulk Action.'
                ]);
            });

            foreach (Student::whereIn('id', $ids)->get() as $student) {
                StudentStatusUpdated::dispatch($student);
            }

            return response()->json([
                'success' => true,
                'message' => 'Selected students have been successfully graduated.'
            ]);

        } catch (\Exception $e) {
            Log::error('Auto Graduate Confirm Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to process auto-graduation.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function searchStudents(Request $request)
    {
        if ($invalid = $this->invalidListQuery($request, ['search'])) {
            return $invalid;
        }

        try {
            $keyword = $request->input('search');
            if (!$keyword) {
                return response()->json(['new' => [], 'old' => []]);
            }
    
            // new database
            $students = Student::select(
                    'id',
                    'student_id',
                    DB::raw("CONCAT_WS(' ', first_name, middle_name, last_name) AS full_name"),
                    'nisn',
                    'nik',
                    'registration_date',
                    DB::raw("'new' as source")
                )
                ->where(function ($query) use ($keyword) {
                    $query->where('student_id', 'like', "%$keyword%")
                        ->orWhere('first_name', 'like', "%$keyword%")
                        ->orWhere('middle_name', 'like', "%$keyword%")
                        ->orWhere('last_name', 'like', "%$keyword%")
                        ->orWhere(DB::raw("CONCAT_WS(' ', first_name, middle_name, last_name)"), 'like', "%$keyword%");
                })
                ->orderBy('registration_date', 'desc') 
                ->limit(50) 
                ->get()
                ->unique(function ($item) {
                    return $item->nisn . '|' . $item->nik;
                })
                ->values()
                ->take(10); 
                
                // old database
                $studentOld = StudentOld::select(
                        'id',
                        DB::raw('studentold_id as student_id'),
                        DB::raw("CONCAT_WS(' ', first_name, middle_name, last_name) AS full_name"),
                        'nisn',
                        'nik',
                        DB::raw('NULL as registration_date'),
                        'section_id',
                        DB::raw("'old' as source")
                    )
                    // A student who already has a record in `students` must be re-registered from
                    // that record; offering the old-database entry again would create a second record.
                    ->whereNotExists(function ($query) {
                        $query->select(DB::raw(1))
                            ->from('students')
                            ->whereColumn('students.student_id', 'student_old_table.studentold_id');
                    })
                    ->where(function ($query) use ($keyword) {
                        $query->where('studentold_id', 'like', "%$keyword%")
                            ->orWhere('first_name', 'like', "%$keyword%")
                            ->orWhere('middle_name', 'like', "%$keyword%")
                            ->orWhere('last_name', 'like', "%$keyword%")
                            ->orWhere(DB::raw("CONCAT_WS(' ', first_name, middle_name, last_name)"), 'like', "%$keyword%");
                    })
                    ->orderByDesc('section_id')
                    ->limit(50)
                    ->get();
    
            $response = [
                'new' => $students->map(function ($item) {
                    return [
                        'id' => $item->id,
                        'student_id' => $item->student_id,
                        'full_name' => $item->full_name,
                        'nisn' => $item->nisn,
                        'nik' => $item->nik,
                        'registration_date' => $item->registration_date,
                        'source' => 'new'
                    ];
                })->values(),
    
                'old' => $studentOld->map(function ($item) {
                    return [
                        'id' => $item->id,
                        'student_id' => $item->student_id,
                        'full_name' => $item->full_name,
                        'nisn' => $item->nisn,
                        'nik' => $item->nik,
                        'section_id' => $item->section_id,
                        'source' => 'old'
                    ];
                })->values(),
            ];
    
            return response()->json($response);

        } catch (\Exception $e) {
            Log::error('Search Students Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to search students.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function getLatestApplication($id, Request $request)
    {
        try {
            $source = $request->input('source', 'new');
            
            if ($source === 'old') {
                $student = StudentOld::where('id', $id)
                    ->orderByDesc('section_id')
                    ->first();
    
                if (!$student) {
                    return response()->json(
                        [
                            'success' => false,
                            'error' => 'No old student found with this ID',
                        ], 404
                    );
                }
    
                $formattedData = [
                    'studentInfo' => [
                        'first_name' => $student->first_name ?? '',
                        'middle_name' => $student->middle_name ?? '',
                        'last_name' => $student->last_name ?? '',
                        'nickname' => $student->nickname ?? '',
                        'religion' => $student->religion ?? '',
                        'place_of_birth' => $student->place_of_birth ?? '',
                        'date_of_birth' => $student->date_of_birth ?? '',
                        'email' => $student->student_email ?? '',
                        'phone_number' => $student->student_phone ?? '',
                        'previous_school' => $student->previous_school ?? '',
                        'gender' => $student->gender ?? '',
                        'nisn' => $student->nisn ?? '',
                        'nik' => $student->nik ?? '',
                        'street' => $student->student_address ?? '',
                    ],
                    'program' => [
                        'section_id' => $student->section_id ?? '',
                        'class_id' => $student->class_id ?? '',
                    ],
                    'parentGuardian' => [
                        'father_name' => $student->father_name ?? '',
                        'father_company' => $student->father_company ?? '',
                        'father_occupation' => $student->father_occupation ?? '',
                        'father_phone' => $student->father_phone ?? '',
                        'father_email' => $student->father_email ?? '',
                        'father_address_street' => $student->father_address ?? '',
                        'mother_name' => $student->mother_name ?? '',
                        'mother_company' => $student->mother_company ?? '',
                        'mother_occupation' => $student->mother_occupation ?? '',
                        'mother_phone' => $student->mother_phone ?? '',
                        'mother_email' => $student->mother_email ?? '',
                        'mother_address_street' => $student->mother_address ?? '',
                        'guardian_name' => $student->guardian_name ?? '',
                        'relation_to_student' => $student->relation_to_student ?? '',
                        'guardian_phone' => $student->guardian_phone ?? '',
                        'guardian_address_street' => $student->guardian_address ?? '',
                    ],
                    'student_status' => 'Old',
                    'input_name' => $student->studentold_id,
                    'student_id' => $student->studentold_id
                ];
    
                return response()->json([
                    'success' => true,
                    'data' => $formattedData
                ]);
            }
    
            $latestVersion = ApplicationFormVersion::with([
                'applicationForm.enrollment.student',
                'applicationForm.enrollment.section'
                ])
                ->whereHas('applicationForm.enrollment.student', function ($q) use ($id) {
                    $q->where('id', $id);
                })
                ->orderByDesc('version_id')
                ->first();
    
            if (!$latestVersion) {
                return response()->json([
                    'success' => false,
                    'error' => 'No application found for this student',
                ], 404);
            }
    
            $dataSnapshot = $latestVersion->data_snapshot ? json_decode($latestVersion->data_snapshot, true) : [];
            $enrollment = $latestVersion->applicationForm->enrollment ?? null;
            $student = $enrollment->student ?? null;
    
            // Extract request_data from snapshot
            $requestData = $dataSnapshot['request_data'] ?? [];
            
            $rawPhotoPath = $requestData['photo_url'] ?? null;
            $processedPhotoUrl = '';
    
            if ($rawPhotoPath) {
                $pathOnly = parse_url($rawPhotoPath, PHP_URL_PATH);
                
                if (!$pathOnly) {
                    $pathOnly = $rawPhotoPath;
                }
    
                $pathOnly = ltrim($pathOnly, '/');
    
                $cleanPath = preg_replace('/^storage\//', '', $pathOnly);
    
                $processedPhotoUrl = URL::to("api/storage-file/{$cleanPath}");
            }
    
            // For ID CARD
            $schoolYearRaw = $requestData['school_year'] ?? null;
            $validUntil = null;
    
            if ($schoolYearRaw) {
                $parts = explode('/', $schoolYearRaw);
                if (count($parts) >= 2) {
                    $endYear = trim($parts[1]);  
                    $validUntil = "31/07/" . $endYear; 
                }
            }
    
            $firstName = $requestData['first_name'] ?? '';
            $middleName = $requestData['middle_name'] ?? '';
            $lastName = $requestData['last_name'] ?? '';
    
            $realSectionId = $enrollment->section_id ?? $requestData['section_id'] ?? '';
            $realSectionName = $enrollment->section->name ?? '';
    
            $idCardData = [
                'first_name'     => $firstName,
                'middle_name'    => $middleName,
                'last_name'      => $lastName,
                'student_id'     => $student->student_id ?? $requestData['student_id'] ?? '',
                'nisn'           => $requestData['nisn'] ?? '',
                'place_of_birth' => $requestData['place_of_birth'] ?? '',
                'date_of_birth'  => $requestData['date_of_birth'] ?? '',
                'section_name'   => $realSectionName, 
                'school_year'    => $schoolYearRaw,
                'valid_until'    => $validUntil, 
                'photo_url'      => $processedPhotoUrl,
                'card_number'    => $student->card_number ?? null, 
            ];
            
            $formattedData = [
                'studentInfo' => [
                    'first_name' => $requestData['first_name'] ?? '',
                    'middle_name' => $requestData['middle_name'] ?? '',
                    'last_name' => $requestData['last_name'] ?? '',
                    'nickname' => $requestData['nickname'] ?? '',
                    'citizenship' => $requestData['citizenship'] ?? '',
                    'country' => $requestData['country'] ?? '',
                    'religion' => $requestData['religion'] ?? '',
                    'place_of_birth' => $requestData['place_of_birth'] ?? '',
                    'date_of_birth' => $requestData['date_of_birth'] ?? '',
                    'email' => $requestData['email'] ?? '',
                    'phone_number' => $requestData['phone_number'] ?? '',
                    'previous_school' => $requestData['previous_school'] ?? '',
                    'academic_status' => $requestData['academic_status'] ?? '',
                    'academic_status_other' => $requestData['academic_status_other'] ?? '',
                    'gender' => $requestData['gender'] ?? '',
                    'family_rank' => $requestData['family_rank'] ?? '',
                    'nisn' => $requestData['nisn'] ?? '',
                    'nik' => $requestData['nik'] ?? '',
                    'kitas' => $requestData['kitas'] ?? '',
                    'va_mandiri' => $student->va_mandiri ?? '',
                    'va_bca' => $student->va_bca ?? '',
                    'va_bni' => $student->va_bni ?? '',
                    'va_bri' => $student->va_bri ?? '',
                    'street' => $requestData['street'] ?? '',
                    'rt' => $requestData['rt'] ?? '',
                    'rw' => $requestData['rw'] ?? '',
                    'village' => $requestData['village'] ?? '',
                    'district' => $requestData['district'] ?? '',
                    'city_regency' => $requestData['city_regency'] ?? '',
                    'province' => $requestData['province'] ?? '',
                    'other' => $requestData['other'] ?? '',
                    'photo_url' => $processedPhotoUrl,
                    'student_active' => $latestVersion->applicationForm?->enrollment?->student?->active ?? '',
                    'status' => $latestVersion->applicationForm?->enrollment?->student?->status ?? '',
                ],
                'program' => [
                    'section_id' => $requestData['section_id'] ?? '',
                    'program_id' => $requestData['program_id'] ?? '',
                    'class_id' => $requestData['class_id'] ?? '',
                    'major_id' => $requestData['major_id'] ?? '',
                    'program_other' => $requestData['program_other'] ?? '',
                    'school_year_id' => $requestData['school_year_id'] ?? '',
                    'school_year' => $requestData['school_year'] ?? '', 
                ],
                'facilities' => [
                    'transportation_id' => $requestData['transportation_id'] ?? '',
                    'pickup_point_id' => $requestData['pickup_point_id'] ?? '',
                    'pickup_point_custom' => $requestData['pickup_point_custom'] ?? '',
                    'transportation_policy' => $requestData['transportation_policy'] ?? '',
                    'residence_id' => $requestData['residence_id'] ?? '',
                    'residence_hall_policy' => $requestData['residence_hall_policy'] ?? '',
                ],
                'parentGuardian' => [
                    'father_name' => $requestData['father_name'] ?? '',
                    'father_company' => $requestData['father_company'] ?? '',
                    'father_occupation' => $requestData['father_occupation'] ?? '',
                    'father_phone' => $requestData['father_phone'] ?? '',
                    'father_email' => $requestData['father_email'] ?? '',
                    'father_address_street' => $requestData['father_address_street'] ?? '',
                    'father_address_rt' => $requestData['father_address_rt'] ?? '',
                    'father_address_rw' => $requestData['father_address_rw'] ?? '',
                    'father_address_village' => $requestData['father_address_village'] ?? '',
                    'father_address_district' => $requestData['father_address_district'] ?? '',
                    'father_address_city_regency' => $requestData['father_address_city_regency'] ?? '',
                    'father_address_province' => $requestData['father_address_province'] ?? '',
                    'father_address_other' => $requestData['father_address_other'] ?? '',
                    'father_company_addresses' => $requestData['father_company_addresses'] ?? '',
                    'mother_name' => $requestData['mother_name'] ?? '',
                    'mother_company' => $requestData['mother_company'] ?? '',
                    'mother_occupation' => $requestData['mother_occupation'] ?? '',
                    'mother_phone' => $requestData['mother_phone'] ?? '',
                    'mother_email' => $requestData['mother_email'] ?? '',
                    'mother_address_street' => $requestData['mother_address_street'] ?? '',
                    'mother_address_rt' => $requestData['mother_address_rt'] ?? '',
                    'mother_address_rw' => $requestData['mother_address_rw'] ?? '',
                    'mother_address_village' => $requestData['mother_address_village'] ?? '',
                    'mother_address_district' => $requestData['mother_address_district'] ?? '',
                    'mother_address_city_regency' => $requestData['mother_address_city_regency'] ?? '',
                    'mother_address_province' => $requestData['mother_address_province'] ?? '',
                    'mother_address_other' => $requestData['mother_address_other'] ?? '',
                    'mother_company_addresses' => $requestData['mother_company_addresses'] ?? '',
                    'guardian_name' => $requestData['guardian_name'] ?? '',
                    'relation_to_student' => $requestData['relation_to_student'] ?? '',
                    'guardian_phone' => $requestData['guardian_phone'] ?? '',
                    'guardian_email' => $requestData['guardian_email'] ?? '',
                    'guardian_address_street' => $requestData['guardian_address_street'] ?? '',
                    'guardian_address_rt' => $requestData['guardian_address_rt'] ?? '',
                    'guardian_address_rw' => $requestData['guardian_address_rw'] ?? '',
                    'guardian_address_village' => $requestData['guardian_address_village'] ?? '',
                    'guardian_address_district' => $requestData['guardian_address_district'] ?? '',
                    'guardian_address_city_regency' => $requestData['guardian_address_city_regency'] ?? '',
                    'guardian_address_province' => $requestData['guardian_address_province'] ?? '',
                    'guardian_address_other' => $requestData['guardian_address_other'] ?? '',
                ],
                'termOfPayment' => [
                    'tuition_fees' => $requestData['tuition_fees'] ?? '',
                    'residence_payment' => $requestData['residence_payment'] ?? '',
                    'financial_policy_contract' => $requestData['financial_policy_contract'] ?? '',
                    'discount_name' => $requestData['discount_name'] ?? '',
                    'discount_notes' => $requestData['discount_notes'] ?? '',
                ],
                'enrollment_status' => $requestData['enrollment_status'] ?? '',
                'application_form_status' => $requestData['application_form_status'] ?? '',
                'student_status' => 'Old',
                'input_name' => $student->id ?? null,
                'student_id' => $student->student_id ?? null,
                'application_id' => $latestVersion->application_id,
                'version_id' => $latestVersion->version_id,
                'idCardInfo' => $idCardData, 
            ];
    
            return response()->json([
                'success' => true,
                'data' => $formattedData,
            ]);

        } catch (\Exception $e) {
            Log::error('Get Latest Application Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve student application details.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function updateStudent(Request $request, $id)
    {
        DB::beginTransaction();
        try {
            $latestVersion = ApplicationFormVersion::with('applicationForm.enrollment.student')
                ->whereHas('applicationForm.enrollment.student', function ($q) use ($id) {
                    $q->where('id', $id);
                })
                ->orderByDesc('version_id')
                ->first();

            if (!$latestVersion) {
                return response()->json([
                    'success' => false,
                    'error' => 'No application found for this student',
                ], 404);
            }

            $student = Student::with(['studentAddress', 'studentParent', 'studentGuardian', 'enrollments'])
                ->findOrFail($id);

            $latestEnrollment = $student->enrollments->sortByDesc('registration_date')->first();
            
            $currentSectionId = $latestEnrollment->section_id ?? null;

            // Map: [section_id => [min_class_id, max_class_id]]
            $classIdRanges = [
                1 => [1, 3],   
                2 => [4, 9],   
                3 => [10, 12], 
                4 => [13, 15],
            ];

            $validated = $request->validate([
                // Student
                'first_name'   => 'sometimes|required|string',
                'middle_name'  => 'sometimes|nullable|string',
                'last_name'    => 'sometimes|nullable|string',
                'nickname'     => 'sometimes|required|string',
                'citizenship' => 'sometimes|required|in:Indonesia,Non Indonesia',
                'country' => 'sometimes|nullable',
                'religion'     => 'sometimes|required|in:Islam,Kristen,Katolik,Hindu,Buddha,Konghucu,Kristen Advent',
                'place_of_birth' => 'sometimes|required|string',
                'date_of_birth' => 'sometimes|required|date|before:today',
                'gender' => 'sometimes|required|string',
                'family_rank' => 'sometimes|required|string',
                'email'        => 'sometimes|required|email',
                'phone_number' => 'sometimes|required|string|max:20',
                'previous_school' => 'sometimes|nullable|string',
                'nisn' => 'sometimes|required|string',
                'nik' => 'sometimes|nullable|required_if:citizenship,Indonesia|integer',
                'kitas' => 'sometimes|nullable|required_if:citizenship,Non Indonesia|string',                
                'photo' => 'sometimes|nullable|image|mimes:jpeg,png,jpg|max:5048',
                'status' => 'sometimes|required|in:Not Graduate,Graduate,Expelled,Withdraw',
                'va_mandiri' => 'sometimes|nullable|string',
                'va_bca' => 'sometimes|nullable|string',
                'va_bni' => 'sometimes|nullable|string',
                'va_bri' => 'sometimes|nullable|string',

                // Address
                'street'       => 'sometimes|required|string',
                'rt' => 'sometimes|nullable|string',
                'rw' => 'sometimes|nullable|string',
                'village' => 'sometimes|required|string',
                'district' => 'sometimes|required|string',
                'city_regency' => 'sometimes|required|string',
                'province'     => 'sometimes|required|string',
                'other'     => 'sometimes|nullable|string',

                // Parent
                'father_name' => 'sometimes|required|string',
                'father_company' => 'sometimes|nullable|string',
                'father_occupation' => 'sometimes|nullable|string',
                'father_phone' => 'sometimes|required|string',
                'father_email' => 'sometimes|required|email',
                'father_address_street' => 'sometimes|required|string',
                'father_address_rt' => 'sometimes|nullable|string',
                'father_address_rw' => 'sometimes|nullable|string',
                'father_address_village' => 'sometimes|required|string',
                'father_address_district' => 'sometimes|required|string',
                'father_address_city_regency' => 'sometimes|required|string',
                'father_address_province' => 'sometimes|required|string',
                'father_address_other' => 'sometimes|nullable|string',

                'mother_name' => 'sometimes|required|string',
                'mother_company' => 'sometimes|nullable|string',
                'mother_occupation' => 'sometimes|nullable|string',
                'mother_phone' => 'sometimes|required|string',
                'mother_email' => 'sometimes|required|email', 
                'mother_address_street' => 'sometimes|required|string',
                'mother_address_rt' => 'sometimes|nullable|string',
                'mother_address_rw' => 'sometimes|nullable|string',
                'mother_address_village' => 'sometimes|required|string',
                'mother_address_district' => 'sometimes|required|string',
                'mother_address_city_regency' => 'sometimes|required|string',
                'mother_address_province' => 'sometimes|required|string',
                'mother_address_other' => 'sometimes|nullable|string',

                // Guardian
                'guardian_name' => 'sometimes|nullable|string',
                'relation_to_student' => 'sometimes|nullable|string',
                'guardian_phone' => 'sometimes|nullable|string',
                'guardian_email' => 'sometimes|nullable|email',
                'guardian_address_street' => 'sometimes|nullable|string',
                'guardian_address_rt' => 'sometimes|nullable|string',
                'guardian_address_rw' => 'sometimes|nullable|string',
                'guardian_address_village' => 'sometimes|nullable|string',
                'guardian_address_district' => 'sometimes|nullable|string',
                'guardian_address_city_regency' => 'sometimes|nullable|string',
                'guardian_address_province' => 'sometimes|nullable|string',
                'guardian_address_other' => 'sometimes|nullable|string',

                // Enrollment
                'residence_id' => 'sometimes|required|exists:residence_halls,residence_id',
                'transportation_id' => 'sometimes|nullable|exists:transportations,transport_id',
                'pickup_point_id' => 'sometimes|nullable|exists:pickup_points,pickup_point_id',
                'pickup_point_custom' => 'sometimes|nullable|string',
                'residence_hall_policy'  => 'sometimes|required|string',
                'transportation_policy'  => 'sometimes|required|string',
                'program_id' => 'sometimes|nullable|exists:programs,program_id',
                'major_id' => 'sometimes|required|exists:majors,major_id',
                'class_id' => [
                    'sometimes', 
                    'required', 
                    'exists:classes,class_id',
                    function ($attribute, $value, $fail) use ($currentSectionId, $classIdRanges) {
                        if (!$currentSectionId) {
                            return $fail('Student does not have an active enrollment section to validate the class.');
                        }

                        if (!isset($classIdRanges[$currentSectionId])) {
                            return $fail("Invalid section ID ($currentSectionId) configured for class validation.");
                        }

                        [$min, $max] = $classIdRanges[$currentSectionId];

                        if ($value < $min || $value > $max) {
                            $fail("The selected class is not valid for the current student's section (Section ID: {$currentSectionId}). Valid range is class ID {$min} to {$max}.");
                        }
                    }
                ],

                // Payment
                'tuition_fees' => 'sometimes|required_with:tuition_fees|in:Full Payment,Installment',
                'residence_payment' => 'sometimes|nullable|required_unless:residence_id,3|in:Full Payment,Installment',
                'financial_policy_contract' => 'sometimes|required_with:financial_policy_contract|in:Signed,Not Signed',
                'discount_name' => 'sometimes|nullable|exists:discount_types,discount_type_id',
                'discount_notes' => 'sometimes|nullable|string',
            ]);
            
            $auditChanges = [];

            // The form leaves the country empty for Indonesian students; store Indonesia.
            $citizenship = $validated['citizenship'] ?? $student->citizenship;
            $country = array_key_exists('country', $validated) ? $validated['country'] : $student->country;
            if ($citizenship === 'Indonesia' && trim((string) $country) === '') {
                $validated['country'] = 'Indonesia';
            }

            // Update student
            $studentData = collect($validated)->except(['academic_status', 'academic_status_other'])->toArray();

            if (isset($studentData['date_of_birth'])) {
                $dob = Carbon::parse($studentData['date_of_birth']);
                $diff = $dob->diff(Carbon::now());
                $studentData['age'] = "{$diff->y} years {$diff->m} months";
            }

            $student->fill($studentData);
            
            $shouldClearCache = false; 
            $cancelledForms = [];
            if ($student->isDirty('status')) {
                $newStatus = $student->status;
                $inactiveStatuses = ['graduate', 'expelled', 'withdraw'];
                $currentSchoolYear = SchoolYearHelper::current();
                $currentSchoolYearId = $currentSchoolYear?->school_year_id;

                if (in_array(strtolower($newStatus), $inactiveStatuses)) {
                    $student->active = 'NO';
                    $shouldClearCache = true;
                    $student->updated_at = now();
                    if ($newStatus === 'Graduate') {
                        $student->graduated_at = now();
                    }

                    // Every running enrollment ends, including the one of the current year when
                    // the student has already re-registered for next year.
                    Enrollment::where('id', $student->id)->where('status', 'ACTIVE')->update(['status' => 'INACTIVE']);

                    // A student who leaves the school does not continue next year either:
                    // cancel the re-registrations for later school years.
                    if (in_array($newStatus, ['Withdraw', 'Expelled'], true)) {
                        $cancelledForms = $this->cancelFutureRegistrations($student, $currentSchoolYear, $newStatus);
                        if ($cancelledForms) {
                            $auditChanges['cancelled_registrations'] = collect($cancelledForms)
                                ->map(fn ($form) => $form->enrollment->registration_id)
                                ->values()
                                ->all();
                        }
                    }
                } else {
                    $student->active = 'YES';
                    $shouldClearCache = true;
                    $student->updated_at = now();

                    // Reactivate the confirmed enrollment of the current school year only.
                    $currentEnrollment = $student->enrollments
                        ->where('school_year_id', $currentSchoolYearId)
                        ->sortByDesc('registration_date')
                        ->first();
                    if ($currentEnrollment && optional($currentEnrollment->applicationForm)->status === 'Confirmed') {
                        $currentEnrollment->status = 'ACTIVE';
                        $currentEnrollment->save();
                    }
                }
            }

            $studentChanges = $student->getDirty();
            $student->save();

            $auditChanges = array_merge($auditChanges, collect($studentChanges)->except('updated_at')->toArray());

            if ($request->hasFile('photo')) {
                $timestamp = now()->format('Y-m-d_H-i-s');
                // Extension is derived from the file content, never from the client-supplied name.
                $extension = $request->file('photo')->extension();
                if (!in_array($extension, ['jpg', 'jpeg', 'png'], true)) {
                    $extension = 'jpg';
                }
                $fileName = "{$timestamp}.{$extension}";
                $folder = "students/{$student->student_id}";
                $photoPath = $request->file('photo')->storeAs($folder, $fileName, 'public');
                $student->photo_path = $photoPath;
                $student->save();
                $auditChanges['photo'] = 'Updated Photo';
            }

            // Student address, parents and guardian belong to an enrollment. They describe the
            // same person in every year, so write them to the latest enrollment (the one the
            // new form version is created for) and to every enrollment of the current and
            // later school years. Earlier years are history and are left as they were.
            $latestForContact = $student->enrollments->sortByDesc('registration_date')->first();
            $currentForContact = SchoolYearHelper::current();
            $contactEnrollments = $student->enrollments->filter(function ($enrollment) use ($latestForContact, $currentForContact) {
                return $enrollment->enrollment_id === $latestForContact?->enrollment_id
                    || ($currentForContact && (
                        $enrollment->school_year_id === $currentForContact->school_year_id
                        || SchoolYearHelper::isAfter($enrollment->school_year_id, $currentForContact)
                    ));
            });
            foreach ($contactEnrollments as $contactEnrollment) {
                $auditChanges = array_merge(
                    $auditChanges,
                    $this->updateEnrollmentContactData($student, $contactEnrollment, $validated)
                );
            }

            // Update enrollment
            if ($request->hasAny([
                'residence_id', 'transportation_id', 'pickup_point_id',
                'pickup_point_custom', 'residence_hall_policy', 'transportation_policy', 
                'major_id', 'class_id', 'program_id'
            ])) {

                $latestEnrollment = $student->enrollments->sortByDesc('registration_date')->first();

                if ($latestEnrollment) {
                    // The column is `transport_id`; a custom pickup point is stored as a
                    // pickup_points row, the same way the registration form does it.
                    $pickupPointId = $request->pickup_point_id ?? $latestEnrollment->pickup_point_id;
                    if (!$request->pickup_point_id && $request->filled('pickup_point_custom')) {
                        $pickupPointId = PickupPoint::firstOrCreate(['name' => trim($request->pickup_point_custom)])->pickup_point_id;
                    }

                    $latestEnrollment->fill([
                        'residence_id'          => $request->residence_id ?? $latestEnrollment->residence_id,
                        'transport_id'          => $request->transportation_id ?? $latestEnrollment->transport_id,
                        'pickup_point_id'       => $pickupPointId,
                        'residence_hall_policy' => $request->residence_hall_policy ?? $latestEnrollment->residence_hall_policy,
                        'transportation_policy' => $request->transportation_policy ?? $latestEnrollment->transportation_policy,
                        'major_id'              => $request->major_id ?? $latestEnrollment->major_id,
                        'class_id'              => $request->class_id ?? $latestEnrollment->class_id,
                        'program_id'              => $request->program_id ?? $latestEnrollment->program_id,
                    ]);

                    if ($latestEnrollment->isDirty()) {
                        $changes = $latestEnrollment->getDirty();
                        $latestEnrollment->save();
                        $auditChanges = array_merge($auditChanges, collect($changes)->except(['updated_at'])->toArray());
                    }
                } else {
                    $student->enrollments()->create([
                        'residence_id'          => $request->residence_id,
                        'transport_id'          => $request->transportation_id,
                        'pickup_point_id'       => $request->pickup_point_id,
                        'residence_hall_policy' => $request->residence_hall_policy,
                        'transportation_policy' => $request->transportation_policy,
                        'major_id'              => $request->major_id,
                        'class_id'              => $request->class_id,
                        'program_id'          => $request->program_id, 
                    ]);
                }
            }

            // Update payment
            if ($request->hasAny(['tuition_fees', 'residence_payment', 'financial_policy_contract'])) {
                $latestEnrollment = $student->enrollments->sortByDesc('registration_date')->first();
                if ($latestEnrollment) {
                    $payment = Payment::where('enrollment_id', $latestEnrollment->enrollment_id)->first();
                    
                    if ($payment) {
                        $payment->fill($request->only(['tuition_fees', 'residence_payment', 'financial_policy_contract']));

                        if ($payment->isDirty()) {
                            $changes = $payment->getDirty();
                            $payment->save();
                            $auditChanges = array_merge($auditChanges, collect($changes)->except(['updated_at', 'id'])->toArray());
                        }
                    }
                }
            }

            // Update discount
            if ($request->hasAny(['discount_name', 'discount_notes'])) {
                $latestEnrollment = $student->enrollments->sortByDesc('registration_date')->first();
                
                if ($latestEnrollment) {
                    $studentDiscount = StudentDiscount::firstOrNew(
                        ['enrollment_id' => $latestEnrollment->enrollment_id]
                    );
                    
                    $discountData = [];
                    if ($request->has('discount_name')) {
                        $studentDiscount->discount_type_id = $validated['discount_name'];
                    }
                    if ($request->has('discount_notes')) {
                        $studentDiscount->notes = $validated['discount_notes'];
                    }
                    
                    $studentDiscount->fill($discountData);

                    if ($studentDiscount->isDirty()) {
                        $changes = $studentDiscount->getDirty();
                        $studentDiscount->save();
                        $auditChanges = array_merge($auditChanges, collect($changes)->except(['updated_at', 'id'])->toArray());
                    }
                }
            }

            $oldSnapshot = $latestVersion->data_snapshot ? json_decode($latestVersion->data_snapshot, true) : [];
            $oldRequestData = $oldSnapshot['request_data'] ?? [];

            $newRequestData = array_merge($oldRequestData, $validated);
            unset($newRequestData['photo']);

            if (($newRequestData['citizenship'] ?? null) === 'Indonesia' && trim((string) ($newRequestData['country'] ?? '')) === '') {
                $newRequestData['country'] = $student->country ?: 'Indonesia';
            }

            $newRequestData['student_active'] = $student->active;
            unset($newRequestData['active']);
            
            if ($student->photo_path) {
                $newRequestData['photo_path'] = $student->photo_path;
                $newRequestData['photo_url']  = asset('storage/' . $student->photo_path);
            }

            $latestEnrollment = $student->enrollments->sortByDesc('registration_date')->first();
            $latestEnrollment->refresh();
            $newRequestData['enrollment_status'] = $latestEnrollment->status;
            $newRequestData['application_form_status'] = ApplicationForm::where('application_id', $latestVersion->application_id)->value('status')
                ?? ($newRequestData['application_form_status'] ?? null);

            $latestEnrollment->load('semester', 'schoolYear', 'payment', 'studentDiscount' ); 
            if ($latestEnrollment->payment) {
                $newRequestData['tuition_fees'] = $latestEnrollment->payment->tuition_fees;
                $newRequestData['residence_payment'] = $latestEnrollment->payment->residence_payment;
                $newRequestData['financial_policy_contract'] = $latestEnrollment->payment->financial_policy_contract;
            }

            if ($latestEnrollment->studentDiscount) {
                $newRequestData['discount_name'] = $latestEnrollment->studentDiscount->discount_type_id;
                $newRequestData['discount_notes'] = $latestEnrollment->studentDiscount->notes;
            }

            $newRequestData['class_id'] = $latestEnrollment->class_id;
            $newRequestData['major_id'] = $latestEnrollment->major_id;
            $newRequestData['program_id'] = $latestEnrollment->program_id;

            $newSnapshot = [
                'id'             => $student->id,
                'student_id'     => $student->student_id,
                'registration_id' => $latestEnrollment?->registration_id,
                'enrollment_id'  => $latestEnrollment?->enrollment_id,
                'registration_number' => $oldSnapshot['registration_number'] ?? null, 
                'registration_date' =>$latestEnrollment?->registration_date,
                'application_id' => $latestVersion->application_id,
                'semester'     => $latestEnrollment?->semester->number,        
                'school_year'  => $latestEnrollment?->schoolYear->year, 
                'request_data'   => $newRequestData,
                'timestamp'      => now(),
                'action'         => 'Update',
            ];

            $applicationId = $latestVersion->application_id;
            $maxVersion = ApplicationFormVersion::where('application_id', $applicationId)->max('version');
            $nextVersion = $maxVersion ? $maxVersion + 1 : 1;
            
            $userName = auth()->user()->username ?? 'system';

            $newVersion = ApplicationFormVersion::create([
                'application_id' => $latestVersion->application_id,
                'version' => $nextVersion,
                'updated_by' => $userName,
                'action' => 'update',
                'data_snapshot' => json_encode($newSnapshot, JSON_PRETTY_PRINT),
            ]);

            DB::commit();

            if ($shouldClearCache) {
                $student->refresh();
                StudentStatusUpdated::dispatch($student);
            }

            foreach ($cancelledForms as $cancelledForm) {
                ApplicationFormStatusUpdated::dispatch($cancelledForm, 'Confirmed', 'Cancelled');
            }

            if (!empty($auditChanges)) {
                $this->auditTrail->log('update_student', [
                    'student_id' => $student->student_id,
                    'changes'    => $auditChanges,
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Student updated and new application form version created',
                'version_id' => $newVersion->version_id,
                'data' => $newSnapshot,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'type' => 'validation',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            DB::rollBack();

            Log::error('Update Student Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'type' => 'server',
                'message' => 'Failed to update student.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /**
     * Cancels the confirmed registrations of school years after $current (the
     * re-registration for next year) of a student who leaves the school, and returns the
     * cancelled application forms.
     */
    private function cancelFutureRegistrations(Student $student, ?SchoolYear $current, string $newStatus): array
    {
        if (!$current) {
            return [];
        }

        $cancelled = [];
        foreach ($student->enrollments as $enrollment) {
            if (!SchoolYearHelper::isAfter($enrollment->school_year_id, $current)) {
                continue;
            }

            $form = $enrollment->applicationForm;
            if (!$form || $form->status !== 'Confirmed') {
                continue;
            }

            $note = "Cancelled automatically: student status changed to {$newStatus} on " . now()->format('Y-m-d') . '.';
            $form->status = 'Cancelled';
            $form->notes = $form->notes ? $form->notes . "\n" . $note : $note;
            $form->save();

            $enrollment->status = 'INACTIVE';
            $enrollment->save();

            $cancelled[] = $form;
        }

        return $cancelled;
    }

    private const ADDRESS_COLUMNS =['street', 'rt', 'rw', 'village', 'district', 'city_regency', 'province', 'other'];

    private const PARENT_COLUMNS = [
        'father_name', 'father_company', 'father_occupation', 'father_phone', 'father_email',
        'mother_name', 'mother_company', 'mother_occupation', 'mother_phone', 'mother_email',
    ];

    /**
     * Writes the address, parent and guardian fields of a profile edit to the rows that
     * belong to $enrollment. The form uses prefixed names (father_address_street,
     * guardian_phone, ...) that do not match the table columns, so each field is mapped
     * explicitly. Only fields present in $validated are written.
     *
     * Returns the changed values, keyed as "<table>.<column>", for the audit log.
     */
    private function updateEnrollmentContactData(Student $student, Enrollment $enrollment, array $validated): array
    {
        $enrollmentId = $enrollment->enrollment_id;
        $changes = [];

        $pick = function (array $columnToField) use ($validated): array {
            $values = [];
            foreach ($columnToField as $column => $field) {
                if (array_key_exists($field, $validated)) {
                    $values[$column] = $validated[$field];
                }
            }
            return $values;
        };
        $addressFields = function (string $prefix): array {
            return array_combine(
                self::ADDRESS_COLUMNS,
                array_map(fn ($column) => $prefix . $column, self::ADDRESS_COLUMNS)
            );
        };

        // Student address
        $values = $pick($addressFields(''));
        if ($values) {
            $address = StudentAddress::firstOrNew(['enrollment_id' => $enrollmentId], ['id' => $student->id]);
            $changes += $this->saveChanges($address, $values, 'student_address');
        }

        // Parents and their addresses
        $parentValues = $pick(array_combine(self::PARENT_COLUMNS, self::PARENT_COLUMNS));
        $fatherAddress = $pick($addressFields('father_address_'));
        $motherAddress = $pick($addressFields('mother_address_'));

        if ($parentValues || $fatherAddress || $motherAddress) {
            $parent = StudentParent::firstOrNew(['enrollment_id' => $enrollmentId], ['id' => $student->id]);
            $changes += $this->saveChanges($parent, $parentValues, 'parent');

            foreach ([[FatherAddress::class, $fatherAddress, 'father_address'], [MotherAddress::class, $motherAddress, 'mother_address']] as [$model, $values, $label]) {
                if ($values) {
                    $row = $model::firstOrNew(['enrollment_id' => $enrollmentId]);
                    $values['parent_id'] = $parent->parent_id;
                    $changes += $this->saveChanges($row, $values, $label);
                }
            }
        }

        // Guardian and guardian address
        $guardianValues = $pick([
            'guardian_name'       => 'guardian_name',
            'relation_to_student' => 'relation_to_student',
            'phone_number'        => 'guardian_phone',
            'guardian_email'      => 'guardian_email',
        ]);
        $guardianAddress = $pick($addressFields('guardian_address_'));

        if ($guardianValues || $guardianAddress) {
            $link = StudentGuardian::where('enrollment_id', $enrollmentId)->first();
            $guardian = $link && $link->guardian_id ? Guardian::find($link->guardian_id) : null;

            // A guardian row shared with another enrollment is copied first, so editing
            // this enrollment does not change the other one.
            if ($guardian && StudentGuardian::where('guardian_id', $guardian->guardian_id)->where('enrollment_id', '<>', $enrollmentId)->exists()) {
                $copy = $guardian->replicate();
                $copy->save();
                if ($guardian->guardianAddress) {
                    $addressCopy = $guardian->guardianAddress->replicate();
                    $addressCopy->guardian_id = $copy->guardian_id;
                    $addressCopy->save();
                }
                $link->guardian_id = $copy->guardian_id;
                $link->save();
                $guardian = $copy;
            }

            $hasAnyValue = collect($guardianValues + $guardianAddress)->filter(fn ($v) => $v !== null && $v !== '')->isNotEmpty();

            if (!$guardian && $hasAnyValue) {
                $guardian = new Guardian();
                $guardian->save();
                if ($link) {
                    $link->guardian_id = $guardian->guardian_id;
                    $link->save();
                } else {
                    StudentGuardian::create([
                        'id'            => $student->id,
                        'guardian_id'   => $guardian->guardian_id,
                        'enrollment_id' => $enrollmentId,
                    ]);
                }
            }

            if ($guardian) {
                $changes += $this->saveChanges($guardian, $guardianValues, 'guardian');
                if ($guardianAddress) {
                    $row = GuardianAddress::firstOrNew(['guardian_id' => $guardian->guardian_id]);
                    $changes += $this->saveChanges($row, $guardianAddress, 'guardian_address');
                }
            }
        }

        return $changes;
    }

    /** Fills and saves the model when something changed; returns the changed values. */
    private function saveChanges($model, array $values, string $label): array
    {
        $model->fill($values);

        if (!$model->exists || $model->isDirty()) {
            $dirty = collect($model->getDirty())->only(array_keys($values))->except(['parent_id']);
            $model->save();

            return $dirty->mapWithKeys(fn ($value, $column) => ["{$label}.{$column}" => $value])->all();
        }

        return [];
    }

    public function getStudentHistoryDates($id)
    {
        try {
            $histories = ApplicationFormVersion::whereHas('applicationForm.enrollment', function ($q) use ($id) {
                    $q->where('id', $id);
                })
                ->with(['applicationForm.enrollment.schoolYear', 'applicationForm.enrollment'])
                ->orderBy('updated_at', 'desc')
                ->get(['version_id', 'application_id', 'updated_at']);
    
            $grouped = $histories->groupBy(function ($item) {
                return $item->applicationForm->enrollment->schoolYear->year ?? 'Unknown Year';
            });
    
            $formatted = $grouped->map(function ($items, $year) {
                return [
                    'school_year' => $year,
                    'dates' => $items->map(function ($item) {
                        return [
                            'version_id' => $item->version_id,
                            'application_id' => $item->application_id,
                            'updated_at' => $item->updated_at->format('d F H:i'),
                        ];
                    })->values(),
                ];
            })->values();
    
            return response()->json($formatted);

        } catch (\Exception $e) {
            Log::error('Get Student History Dates Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve history dates.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function getHistoryDetail($id, $versionId)
    {
        try {
            $version = ApplicationFormVersion::with('applicationForm.enrollment.student')
                ->whereHas('applicationForm.enrollment', function ($q) use ($id) {
                    $q->where('id', $id);
                })
                ->findOrFail($versionId);

            $student = $version->applicationForm->enrollment->student ?? null;
            return response()->json([
                'success'            => true,
                'version_id'         => $version->version_id,
                'id'                 => $version->applicationForm->enrollment->id ?? null,
                'student_id'         => $student->student_id,
                'application_form_id'=> $version->application_id,
                'updated_at'         => $version->updated_at,
                'data_snapshot'      => json_decode($version->data_snapshot, true),
            ], 200);

        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'History version not found',
            ], 404);
        } catch (\Exception $e) {
            Log::error('Get History Detail Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Something went wrong',
                'error'   => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function storeCardNumber(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'card_number' => 'required|string|max:50|unique:students,card_number,' . $id,
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed. Please check your input.',
                'errors'  => $validator->errors() 
            ], 422);
        }

        try {
            $student = Student::findOrFail($id);

            $oldCardNumber = $student->card_number;
            $student->card_number = $request->card_number;
            $student->save();

            $this->auditTrail->log('generate_id_card', [
                'student_id' => $student->student_id,
                'changes' => [
                    'card_number' => [
                        'from' => $oldCardNumber,
                        'to' => $request->card_number
                    ]
                ],
                'description' => 'ID Card number generated/updated.'
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Card number saved successfully.',
                'data' => [
                    'card_number' => $student->card_number
                ]
            ]);

        } catch (\Exception $e) {
            Log::error('Store Card Number Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to save card number.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }
}