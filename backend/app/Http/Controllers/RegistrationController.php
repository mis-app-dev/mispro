<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use App\Models\Enrollment;
use Illuminate\Http\Request;
use App\Models\ApplicationForm;
use Illuminate\Support\Facades\DB;
use App\Services\AuditTrailService;
use Illuminate\Support\Facades\Log;
use App\Services\RegistrationService; 
use App\Models\CancelledRegistrationView;
use Illuminate\Support\Facades\Validator;

class RegistrationController extends Controller
{
    protected $auditTrail;
    protected $registrationService;

    public function __construct(AuditTrailService $auditTrail, RegistrationService $registrationService)
    {
        $this->auditTrail = $auditTrail;
        $this->registrationService = $registrationService;
    }

    public function index(Request $request)
    {
        if ($invalid = $this->invalidListQuery($request, ['search', 'search_id', 'search_name'], ['start_date', 'end_date'], true)) {
            return $invalid;
        }

        try {
            $query = Enrollment::query()
                ->select(
                    'enrollments.*',
                    'application_forms.application_id',
                    'school_years.year as school_year',
                    'classes.grade',
                    'sections.name as section_name',
                    'application_forms.status as application_status'
                )
                ->selectRaw("CONCAT_WS(' ', students.first_name, students.middle_name, students.last_name) AS full_name")
                ->addSelect('application_form_versions.version_id')
                ->join('students', 'students.id', '=', 'enrollments.id')
                ->leftJoin('school_years', 'enrollments.school_year_id', '=', 'school_years.school_year_id')
                ->leftJoin('classes', 'enrollments.class_id', '=', 'classes.class_id')
                ->leftJoin('sections', 'enrollments.section_id', '=', 'sections.section_id')           
                ->leftJoin('application_forms', 'application_forms.enrollment_id', '=', 'enrollments.enrollment_id')
                ->leftJoin('application_form_versions', 'application_form_versions.version_id', '=', DB::raw('(SELECT MAX(version_id) FROM application_form_versions WHERE application_id = application_forms.application_id AND action = "registration")'))
                ->addSelect('application_form_versions.version_id as registration_version_id')
                ->where('application_forms.status', 'Confirmed');
    
            // Filter Range
            if ($request->filled('start_date') && $request->filled('end_date')) {
                $start = Carbon::parse($request->input('start_date'))->startOfDay();
                $end = Carbon::parse($request->input('end_date'))->endOfDay();
                $query->whereBetween('enrollments.registration_date', [$start, $end]);
            }
    
            // Filter Search
            if ($regisId = $request->input('search_id')) {
                $query->where('registration_id', 'like', "%$regisId%");
            }
    
            // Filter Global
            if ($search = trim($request->input('search', ''))) {
                $query->where(function ($q) use ($search) {
                    if (is_numeric($search)) {
                        $q->where('students.id', 'LIKE', "%{$search}%");
                    } else {
                        $q->whereRaw("CONCAT_WS(' ', students.first_name, students.middle_name, students.last_name) LIKE ?", ["%{$search}%"]);
                    }
                });
            } elseif ($request->filled('search_name')) {
                $searchName = strtolower(trim($request->input('search_name')));
                $query->whereRaw("LOWER(CONCAT_WS(' ', COALESCE(students.first_name,''), COALESCE(students.middle_name,''), COALESCE(students.last_name,''))) LIKE ?", ["%{$searchName}%"]);
            }
    
            // Filter Checkbox
            if ($request->input('school_year')) {
                $schoolYear = $request->input('school_year');
                $query->whereIn('school_years.year', (array)$schoolYear);
            }
    
            if ($request->filled('grade')) {
                $grades = (array) $request->input('grade');
                $query->whereIn('classes.grade', $grades);
            }
    
            if ($request->filled('section')) {
                $sections = (array) $request->input('section');
                $query->whereIn('sections.name', $sections);
            }
    
            if ($request->filled('status')) {
                $statuses = (array) $request->input('status');
                $query->whereIn('application_forms.status', $statuses);
            }
    
            // Sort
            $sorts = $request->input('sort', []);
    
            $sortable = [
                'registration_date' => 'enrollments.registration_date',
                'registration_id' => 'enrollments.registration_id',
                'school_year' => 'school_years.year',
                'full_name' => "CONCAT_WS(' ', students.first_name, students.middle_name, students.last_name)",
                'grade' => 'classes.grade',
                'section' => 'sections.name',
                'application_status' => 'application_forms.status',
            ];
    
            if (empty($sorts)) {
                $query->orderBy('enrollments.registration_date', 'desc');
            } else {
                foreach ($sorts as $sort) {
                    $field = $sort['field'] ?? null;
                    $order = strtolower($sort['order'] ?? 'asc');
                    $order = ($order === 'desc') ? 'desc' : 'asc';
    
                    if (!$field || !array_key_exists($field, $sortable)) continue;
    
                    if ($field === 'registration_id') {
                        $query->orderByRaw("
                            CASE
                                WHEN SUBSTRING_INDEX(SUBSTRING_INDEX(enrollments.registration_id, '/', -2), '/', 1) LIKE '%ECP%' THEN 1    
                                WHEN SUBSTRING_INDEX(SUBSTRING_INDEX(enrollments.registration_id, '/', -2), '/', 1) LIKE '%ES%' THEN 2    
                                WHEN SUBSTRING_INDEX(SUBSTRING_INDEX(enrollments.registration_id, '/', -2), '/', 1) LIKE '%MS%' THEN 3    
                                WHEN SUBSTRING_INDEX(SUBSTRING_INDEX(enrollments.registration_id, '/', -2), '/', 1) LIKE '%HS%' THEN 4    
                                ELSE 5
                            END $order
                        ")->orderByRaw("
                            CAST(SUBSTRING_INDEX(enrollments.registration_id, '/', 1) AS UNSIGNED) $order
                        ")->orderByRaw("
                            CAST(SUBSTRING_INDEX(enrollments.registration_id, '-', -1) AS UNSIGNED) $order
                        ");
                    } elseif ($field === 'full_name') {
                        $query->orderByRaw($sortable[$field] . ' ' . $order);
                    } elseif ($field === 'application_status') {
                        $query->orderByRaw("
                            CASE application_forms.status
                                WHEN 'Cancelled' THEN 1
                                WHEN 'Confirmed' THEN 2
                                ELSE 3
                            END $order
                        ");
                    } else {
                        $query->orderByRaw($sortable[$field] . ' ' . $order);
                    }
                }
            }
            
            // Pagination
            $data = $query->paginate(min(max((int) $request->input('per_page', 25), 1), 100));
            $totalRegistered = ApplicationForm::count();
    
            return response()->json([
                'success' => true,
                'message' => $data->isEmpty() ? 'No students found' : 'Students retrieved successfully',
                'total_registered' => $totalRegistered,
                'data' => $data
            ], 200);

        } catch (\Exception $e) {
            Log::error('Registration Index Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve registration list.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    // Registration
    public function startRegistration(Request $request)
    {
        
        $validator = Validator::make($request->all(), [
            'school_year_id' => 'required|integer|exists:school_years,school_year_id',
            'semester_id' => 'required|integer|exists:semesters,semester_id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors()
            ], 422);
        }
        
        try {
            $validated = $validator->validated();
            $userId = auth()->id();

            $result = $this->registrationService->createRegistrationDraft($validated, $userId);

            return response()->json([
                'success' => true,
                'message' => 'Initial registration context saved successfully.',
                'data' => $result,
            ], 200);

        } catch (\Exception $e) {
            Log::error('Start Registration Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false, 
                'message' => 'Failed to initialize registration.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function getRegistrationContext($draft_id)
    {
        try {
            $draft = $this->registrationService->getRegistrationContext($draft_id, auth()->id());
            
            if (!$draft) {
                return response()->json([
                    'success' => false,
                    'error' => 'Draft not found or unauthorized access.',
                ], 404);
            }
    
            return response()->json([
                'success' => true,
                'data' => [
                    'school_year' => $draft->school_year_id,
                    'semester' => $draft->semester_id,
                    'registration_date' => $draft->registration_date_draft,
                ],
            ], 200);

        } catch (\Exception $e) {
            Log::error('Get Registration Context Error: ' . $e->getMessage(), [
                'draft_id' => $draft_id,
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve registration context.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function store(Request $request, $draft_id)
    {
        // validate request
        $validated = $request->validate([
            // student
            'student_status' => 'required|in:New,Old,Transferee',
            'input_name' => 'nullable|string',
            'first_name' => 'required|string',
            'middle_name' => 'nullable|string',
            'last_name' => 'nullable|string',
            'nickname' => 'nullable|string',
            'citizenship' => 'required|in:Indonesia,Non Indonesia',
            'country' => function ($attribute, $value, $fail) use ($request) {
                if ($request->citizenship === 'Non Indonesia' && empty($value)) {
                    $fail('The country field is required when selecting "Non-Indonesia" as the citizenship.');
                }
            },
            'religion' => 'required|string',
            'place_of_birth' => 'required|string',
            'date_of_birth' => 'required|date|before:today',
            'email' => 'required|email',
            'phone_number' => 'required|string',
            'previous_school' => 'nullable|string',
            'academic_status' => 'required|in:REGULAR,SIT-IN,OTHER',
            'academic_status_other' => function ($attribute, $value, $fail) use ($request) {
                if ($request->academic_status === 'OTHER' && empty($value)) {
                    $fail('The academic_status_other field is required when selecting "OTHER" as the academic status.');
                }
            },
            'gender' => 'required|in:MALE,FEMALE',
            'family_rank' => 'required|string',
            'age' => 'required|string',
            'nisn' => 'nullable|string',
            'nik' => 'nullable|integer',
            'kitas' => 'nullable|string',
            'va_mandiri' => 'nullable|string',
            'va_bca' => 'nullable|string',
            'va_bni' => 'nullable|string',
            'va_bri' => 'nullable|string',
            

            'street' => 'required|string',
            'rt' => 'nullable|string',
            'rw' => 'nullable|string',
            'village' => 'required|string',
            'district' => 'required|string',
            'city_regency' => 'required|string',
            'province' => 'required|string',
            'other' => 'nullable|string',

            'section_id' => 'required|exists:sections,section_id',
            'program_id' => 'nullable|exists:programs,program_id',
            'class_id' => 'required|exists:classes,class_id',
            'major_id' => 'required|exists:majors,major_id',
            'program_other' => function ($attribute, $value, $fail) use ($request) {
                if (empty($request->program_id) && empty($value)) {
                    $fail('The program_other field is required when selecting "Other" as the program.');
                }
            },
            
            'transportation_id' => 'nullable|exists:transportations,transport_id',
            'pickup_point_id' => 'nullable|integer|exists:pickup_points,pickup_point_id',
            'pickup_point_custom' => 'nullable|string|max:255',
            'transportation_policy' => 'required|in:Signed,Not Signed',
            'residence_id' => 'required|integer|exists:residence_halls,residence_id',
            'residence_hall_policy' => 'required|in:Signed,Not Signed',

            'father_name' => 'nullable|string',
            'father_company' => 'nullable|string',
            'father_occupation' => 'nullable|string',
            'father_phone' => 'nullable|string',
            'father_email' => 'nullable|email', 
            'father_address_street' => 'nullable|string',
            'father_address_rt' => 'nullable|string',
            'father_address_rw' => 'nullable|string',
            'father_address_village' => 'nullable|string',
            'father_address_district' => 'nullable|string',
            'father_address_city_regency' => 'nullable|string',
            'father_address_province' => 'nullable|string',
            'father_address_other' => 'nullable|string',

            // student parent (mother)
            'mother_name' => 'nullable|string',
            'mother_company' => 'nullable|string',
            'mother_occupation' => 'nullable|string',
            'mother_phone' => 'nullable|string',
            'mother_email' => 'nullable|email', 
            'mother_address_street' => 'nullable|string',
            'mother_address_rt' => 'nullable|string',
            'mother_address_rw' => 'nullable|string',
            'mother_address_village' => 'nullable|string',
            'mother_address_district' => 'nullable|string',
            'mother_address_city_regency' => 'nullable|string',
            'mother_address_province' => 'nullable|string',
            'mother_address_other' => 'nullable|string',

            'guardian_name' => 'nullable|string',
            'relation_to_student' => 'nullable|string',
            'guardian_phone' => 'nullable|string',
            'guardian_email' => 'nullable|email', 
            'guardian_address_street' => 'nullable|string',
            'guardian_address_rt' => 'nullable|string',
            'guardian_address_rw' => 'nullable|string',
            'guardian_address_village' => 'nullable|string',
            'guardian_address_district' => 'nullable|string',
            'guardian_address_city_regency' => 'nullable|string',
            'guardian_address_province' => 'nullable|string',
            'guardian_address_other' => 'nullable|string',
            
            'tuition_fees' => 'required|in:Full Payment,Installment',
            'residence_payment' => 'nullable|required_unless:residence_id,3|in:Full Payment,Installment',
            'financial_policy_contract' => 'required|in:Signed,Not Signed',

            'discount_name' => 'nullable|string',
            'discount_notes' => 'nullable|string',

            'source' => 'nullable|string|in:new,old', 
        ]);
        
        if ($validated['citizenship'] === 'Indonesia') {
            $validated['country'] = 'Indonesia';
        }

        try {
            $source = $request->input('source');
            $userId = auth()->id();

            $result = $this->registrationService->registerStudent($validated, $draft_id, $userId, $source);
            
            return response()->json([
                'success' => true, 
                'message' => 'Registration submitted successfully.',
                'data' => $result
            ], 200);
            
        } catch (\Exception $e) {
            DB::rollback();

            // Rejections raised on purpose by RegistrationService (duplicate student, wrong
            // section, ...) are meant for the registrar. Return their message in `message`
            // and in `error` (the registration popup matches on `error`) whatever APP_DEBUG is.
            if ($status = $this->clientErrorStatus($e)) {
                Log::warning('Registration Store Rejected: ' . $e->getMessage(), ['draft_id' => $draft_id]);

                return response()->json([
                    'success' => false,
                    'message' => $e->getMessage(),
                    'error'   => $e->getMessage(),
                ], $status);
            }

            Log::error('Registration Store Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Registration failed due to a server error.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /**
     * HTTP status for an exception thrown on purpose with a 4xx code, or null for
     * anything else. Database exceptions carry an SQLSTATE such as "22001" as their
     * code, which must never be used as an HTTP status.
     */
    private function clientErrorStatus(\Throwable $e): ?int
    {
        if ($e instanceof \Illuminate\Database\QueryException || $e instanceof \PDOException) {
            return null;
        }

        $code = $e->getCode();

        return (is_int($code) && $code >= 400 && $code < 500) ? $code : null;
    }

    // Preview
    public function showPreview($applicationId, $versionId)
    {
        try {
            Log::info('Preview called', [
                'application_id' => $applicationId,
                'version_id' => $versionId
            ]);

            $snapshot = $this->registrationService->getPreviewData($applicationId, $versionId);

            return response()->json([
                'success' => true,
                'message' => 'Preview data retrieved successfully',
                'data' => $snapshot
            ], 200, [], JSON_PRETTY_PRINT);

        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Registration version not found.',
            ], 404);
        } catch (\Exception $e) {
            Log::error('Preview Failed Error: ' . $e->getMessage(), [
                'application_id' => $applicationId,
                'version_id' => $versionId,
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to load preview data.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

        // Cancel Registration
    public function handleCancelRegistration(Request $request, $application_id, string $reason_type)
    {
        if ($reason_type === 'cancellationOfEnrollment') {
            $request->validate([
                'notes' => 'required|string|max:1000',
            ]);
        }

        try {
            $notes = $request->input('notes');
            $user_name = auth()->user()->username ?? 'anonymous';
            
            $successMessage = $this->registrationService->cancelRegistration(
                $application_id, 
                $reason_type, 
                $notes, 
                $user_name
            );

            return response()->json([
                'success' => true, 
                'message' => $successMessage
            ], 200);

        } catch (\Exception $e) {
            Log::error('Cancel Registration Error: ' . $e->getMessage(), [
                'application_form_id' => $application_id,
                'reason_type' => $reason_type,
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            $clientStatus = $this->clientErrorStatus($e);
            $statusCode = $clientStatus ?? 500;

            $clientMessage = $clientStatus
                ? $e->getMessage()
                : 'Failed to cancel registration (Internal Server Error).';

            return response()->json([
                'success' => false,
                'message' => $clientMessage,
                'error' => $clientStatus || config('app.debug') ? $e->getMessage() : null,
            ], $statusCode);
        }
    }

    public function getCancelledRegistrations(Request $request)
    {
        $invalid = $this->invalidListQuery(
            $request,
            ['search', 'filter_name', 'filter_notes', 'sort_by', 'sort_order'],
            ['reg_start_date', 'reg_end_date', 'cancel_start_date', 'cancel_end_date']
        );
        if ($invalid) {
            return $invalid;
        }

        try {
            $query = CancelledRegistrationView::query();
    
            // Global Search (Student Name)
            if ($request->filled('search')) {
                $keyword = $request->search;
                $query->where('full_name', 'LIKE', "%{$keyword}%");
            }
    
            // Filter Full Name
            if ($request->filled('filter_name')) {
                $keyword = $request->filter_name;
                $query->where('full_name', 'LIKE', "%{$keyword}%");
            }
    
            // Filter School Year (Checkbox - Multiple Select)
            if ($request->filled('school_years') && is_array($request->school_years)) {
                $query->whereIn('school_year_id', $request->school_years);
            }
    
            // Filter Section (Checkbox - Multiple Select)
            if ($request->filled('sections') && is_array($request->sections)) {
                $query->whereIn('section_id', $request->sections);
            }
    
            // Filter Registration Date (Range)
            if ($request->filled('reg_start_date') && $request->filled('reg_end_date')) {
                $query->whereBetween('registration_date', [
                    Carbon::parse($request->reg_start_date)->startOfDay(),
                    Carbon::parse($request->reg_end_date)->endOfDay()
                ]);
            }
    
            // Filter Cancelled At (Range)
            if ($request->filled('cancel_start_date') && $request->filled('cancel_end_date')) {
                $query->whereBetween('cancelled_at', [
                    Carbon::parse($request->cancel_start_date)->startOfDay(),
                    Carbon::parse($request->cancel_end_date)->endOfDay()
                ]);
            }
    
            // Filter Notes
            if ($request->filled('filter_notes')) {
                $keyword = $request->filter_notes;
                $query->where('notes', 'LIKE', "%{$keyword}%");
            }
    
            // Filter student status (Checkbox - Multiple)
            if ($request->filled('student_status') && is_array($request->student_status)) {
                $query->whereIn('student_status', $request->student_status);
            }
    
            // Sort
            $sortField = $request->input('sort_by', 'cancelled_at');
            $sortOrder = strtolower((string) $request->input('sort_order', 'desc')) === 'asc' ? 'asc' : 'desc';
    
            $allowedSorts = ['full_name', 'registration_date', 'cancelled_at', 'school_year', 'section', 'student_status', 'notes'];
    
            if (in_array($sortField, $allowedSorts)) {
                $query->orderBy($sortField, $sortOrder);
            } else {
                $query->orderBy('cancelled_at', 'desc');
            }
            
            $data = $query->paginate(min(max((int) $request->input('per_page', 25), 1), 100));
    
            return response()->json([
                'status' => 'success',
                'data' => $data
            ]);

        } catch (\Exception $e) {
            Log::error('Get Cancelled Registrations Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve cancelled registrations.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }
}
