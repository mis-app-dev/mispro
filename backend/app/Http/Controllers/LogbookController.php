<?php

namespace App\Http\Controllers;

use Exception;
use App\Models\Student;
use App\Models\SchoolYear;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\Log;

class LogbookController extends Controller
{
    public function index (Request $request) {
        if ($invalid = $this->invalidLogbookQuery($request)) {
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

            if (!$defaultSchoolYearId) {
                return response()->json([
                    'success' => false,
                    'error' => 'Active school year not found.',
                ], 404);
            }

            $targetSchoolYearIds = [];

            if ($schoolYearsRequest = $request->input('school_years')) {
                $targetSchoolYearIds = SchoolYear::whereIn('year', (array)$schoolYearsRequest)
                                                ->pluck('school_year_id')
                                                ->toArray();
            } else {
                $targetSchoolYearIds[] = $defaultSchoolYearId;
            }

            $latestEnrollmentSub = DB::table('enrollments AS e_latest')
                ->select('e_latest.id AS student_id', 'e_latest.school_year_id', DB::raw('MAX(e_latest.semester_id) AS max_semester_id'))
                ->whereIn('e_latest.school_year_id', $targetSchoolYearIds)
                ->groupBy('e_latest.id', 'e_latest.school_year_id');

            $latestEnrollmentIdSub = DB::table('enrollments AS e_id')
                ->select('e_id.enrollment_id', 'e_id.id AS student_id', 'e_id.school_year_id')
                ->joinSub($latestEnrollmentSub, 'latest_e_sub', function ($join) {
                    $join->on('e_id.id', '=', 'latest_e_sub.student_id')
                            ->on('e_id.school_year_id', '=', 'latest_e_sub.school_year_id')
                            ->on('e_id.semester_id', '=', 'latest_e_sub.max_semester_id');
                })
                ->groupBy('e_id.enrollment_id', 'e_id.id', 'e_id.school_year_id');

            $latestApplicationVersionSub = DB::table('application_form_versions AS afv')
            ->select('afv.application_id', 'afv.data_snapshot')
            ->join('application_forms AS af', 'af.application_id', '=', 'afv.application_id')
            ->whereRaw('afv.version_id = (
                SELECT MAX(afv2.version_id) 
                FROM application_form_versions AS afv2
                WHERE afv2.application_id = afv.application_id
            )');
            
            $studentsQuery = Student::where('active', 'YES')
                ->select('students.*') 
                ->addSelect('latest_app_version.data_snapshot as latest_data_snapshot') 
                ->addSelect(
                    'p_join.father_name',
                    'p_join.father_occupation',
                    'p_join.father_phone',
                    'p_join.mother_name',
                    'p_join.mother_occupation',
                    'p_join.mother_phone'
                )
                ->addSelect(
                    'sa_join.street',
                    'sa_join.rt',
                    'sa_join.rw',
                    'sa_join.village',
                    'sa_join.district',
                    'sa_join.city_regency',
                    'sa_join.province',
                    'sa_join.other'
                )
                ->with([
                    'enrollments' => function ($q) use ($targetSchoolYearIds, $latestEnrollmentIdSub) {
                        $latestIds = $latestEnrollmentIdSub->pluck('enrollment_id');
                        $q->whereIn('enrollment_id', $latestIds);
                        $q->whereIn('school_year_id', $targetSchoolYearIds);
                        $q->orderBy('semester_id', 'desc'); 
                        $q->with(['schoolClass', 'section', 'schoolYear', 'transportation', 'major']);
                    },
                ])
                ->joinSub($latestEnrollmentIdSub, 'e_latest_join', function ($join) {
                    $join->on('students.id', '=', 'e_latest_join.student_id');
                })
                ->leftJoin('parents AS p_join', function ($join) {
                    $join->on('p_join.enrollment_id', '=', 'e_latest_join.enrollment_id');
                    $join->on('p_join.id', '=', 'students.id'); 
                })
                ->leftJoin('student_addresses AS sa_join', function ($join) {
                    $join->on('sa_join.enrollment_id', '=', 'e_latest_join.enrollment_id');
                    $join->on('sa_join.id', '=', 'students.id'); 
                })
                ->join('enrollments AS e_join', 'e_join.enrollment_id', '=', 'e_latest_join.enrollment_id') 
                ->join('application_forms AS af_join', 'af_join.enrollment_id', '=', 'e_latest_join.enrollment_id')
                ->leftJoinSub($latestApplicationVersionSub, 'latest_app_version', function ($join) {
                    $join->on('latest_app_version.application_id', '=', 'af_join.application_id');
                });

            $studentsQuery->where('af_join.status', 'Confirmed');

            $filterSchoolYearIds = $targetSchoolYearIds; 

            // Filter (search)
            if ($name = $request->input('search_name')) {
                $studentsQuery->where(function ($q) use ($name) {
                    $q->whereRaw("CONCAT(first_name, ' ', COALESCE(middle_name, ''), ' ', last_name) LIKE ?", ["%{$name}%"]);
                });
            }

            if ($family = $request->input('search_family_rank')) {
                $studentsQuery->where('family_rank', 'like', "%$family%");
            }

            if ($religion = $request->input('search_religion')) {
                $studentsQuery->where('religion', 'like', "%$religion%");
            }
            
            if ($country = $request->input('search_country')) {
                $studentsQuery->where('country', 'like', "%$country%");
            }

            if ($previousSchool = $request->input('search_previous_school')) {
                $studentsQuery->where('students.previous_school', 'like', "%$previousSchool%");
            }

            if ($father = $request->input('search_father')) {
                $studentsQuery->where('p_join.father_name', 'like', "%$father%");
            }

            if ($mother = $request->input('search_mother')) {
                $studentsQuery->where('p_join.mother_name', 'like', "%$mother%");
            }

            $joinMap = [
                'enrollments' => true,
                'classes' => false,
                'sections' => false,
                'school_years' => false,
                'transportations' => false,
                'parents' => true,
            ];

            // Fiter (checkbox)
            if ($grades = $request->input('grades')) {
                if (!$joinMap['classes']) {
                    $studentsQuery->leftJoin('classes', 'e_join.class_id', '=', 'classes.class_id');
                    $joinMap['classes'] = true;
                }
                $studentsQuery->whereIn('classes.grade', (array)$grades);
            }

            if ($sections = $request->input('sections')) {
                if (!$joinMap['sections']) {
                    $studentsQuery->leftJoin('sections', 'e_join.section_id', '=', 'sections.section_id');
                    $joinMap['sections'] = true;
                }
                $studentsQuery->whereIn('sections.name', (array)$sections);
            }

            if ($schoolYears = $request->input('school_years')) {
                $studentsQuery->whereIn('e_latest_join.school_year_id', $targetSchoolYearIds);
            }

            if ($genders = $request->input('genders')) {
                $studentsQuery->whereIn('gender', (array)$genders);
            }

            if ($citizenships = $request->input('citizenships')) {
                $studentsQuery->whereIn('students.citizenship', (array)$citizenships);
            }

            if ($majors = $request->input('majors')) {
                $studentsQuery->whereIn('e_join.major_id', (array)$majors);
            }

            if ($transportations = $request->input('transportations')) {
                if (!$joinMap['transportations']) {
                    $studentsQuery->leftJoin('transportations', 'e_join.transport_id', '=', 'transportations.transport_id');
                    $joinMap['transportations'] = true;
                }
                $studentsQuery->whereIn('transportations.type', (array)$transportations);
            }

            // Filter (range)
            if ($request->filled('start_date') && $request->filled('end_date')) {
                $studentsQuery->whereBetween('e_join.registration_date', [
                    $request->input('start_date'), 
                    $request->input('end_date')
                ]);
            }

            if ($request->filled('min_age') && $request->filled('max_age')) {
                $studentsQuery->whereBetween('age', [
                    $request->input('min_age'), 
                    $request->input('max_age')
                ]);
            }

            // Sort
            $sortable = [
                'student_id',
                'full_name',
                'first_name',
                'middle_name',
                'last_name',
                'grade',
                'section',
                'major',
                'school_year',
                'gender',
                'registration_date',
                'transportation',
                'family_rank',
                'age',
                'religion',
                'citizenship',
                'country',
                'previous_school',
                'father_name',
                'father_occupation',
                'mother_name',
                'mother_occupation',
            ];

            $sorts = $request->input('sort', []);

            foreach ($sorts as $sort) {
                $field = $sort['field'] ?? null;
                $order = strtolower($sort['order'] ?? 'asc') === 'desc' ? 'desc' : 'asc';

                if (!$field || !in_array($field, $sortable)) continue;

                if (!collect($studentsQuery->getQuery()->columns)->contains('e_join.enrollment_id')) {
                    $studentsQuery->addSelect('e_join.enrollment_id');
                }

                switch ($field) {
                    case 'student_id':
                        $studentsQuery->orderByRaw("CAST(students.student_id AS UNSIGNED) $order");
                        break;

                    case 'full_name':
                        $studentsQuery->orderByRaw("CONCAT(COALESCE(students.first_name,''), ' ', COALESCE(students.middle_name, ''), ' ', COALESCE(students.last_name,'')) $order");
                        break;

                    case 'grade':
                        if (!$joinMap['classes']) {
                            $studentsQuery->leftJoin('classes', 'e_join.class_id', '=', 'classes.class_id');
                            $joinMap['classes'] = true;
                        }
                        $studentsQuery->orderBy('classes.grade', $order);
                        break;

                    case 'section':
                        if (!$joinMap['sections']) {
                            $studentsQuery->leftJoin('sections', 'e_join.section_id', '=', 'sections.section_id');
                            $joinMap['sections'] = true;
                        }
                        $studentsQuery->orderBy('sections.name', $order);
                        break;

                    case 'school_year':
                        if (!$joinMap['school_years']) {
                            $studentsQuery->leftJoin('school_years', 'e_join.school_year_id', '=', 'school_years.school_year_id');
                            $joinMap['school_years'] = true;
                        }
                        $studentsQuery->orderBy('school_years.year', $order);
                        break;

                    case 'major':
                        $studentsQuery->orderByRaw("(SELECT majors.name FROM majors WHERE majors.major_id = e_join.major_id) $order");
                        break;

                    case 'registration_date':
                        $studentsQuery->orderBy('e_join.registration_date', $order);
                        break;

                    case 'transportation':
                        if (!$joinMap['transportations']) {
                            $studentsQuery->leftJoin('transportations', 'e_join.transport_id', '=', 'transportations.transport_id');
                            $joinMap['transportations'] = true;
                        }
                        $studentsQuery->orderBy('transportations.type', $order);
                        break;

                    case 'age':
                        $dobOrder = ($order === 'asc') ? 'desc' : 'asc';
                        $studentsQuery->orderBy('students.date_of_birth', $dobOrder);
                        break;

                    case 'religion':
                        $studentsQuery->orderByRaw("CAST(students.religion AS CHAR) $order");
                        break;

                    case 'father_name':
                    case 'father_occupation':
                    case 'mother_name':
                    case 'mother_occupation':
                        $studentsQuery->orderBy("p_join.$field", $order);
                        break;

                    default:
                        $studentsQuery->orderBy("students.$field", $order);
                        break;
                }
            }

            $studentsQuery->groupBy(
                'students.id',
                'students.student_id',
                'students.studentall_id',
                'students.first_name',
                'students.middle_name',
                'students.last_name',
                'students.nickname',
                'students.citizenship',
                'students.gender',
                'students.age',
                'students.nisn',
                'students.family_rank',
                'students.place_of_birth',
                'students.date_of_birth',
                'students.email',
                'students.previous_school',
                'students.religion',
                'students.country',
                'students.active',
                'students.status',
                'students.photo_path',
                'students.phone_number',
                'students.nik',
                'students.kitas',
                'students.academic_status',
                'students.academic_status_other',
                'students.registration_date',
                'students.va_mandiri',
                'students.va_bca',
                'students.va_bni',
                'students.va_bri',
                'students.updated_at',
                'students.graduated_at',
                'students.card_number',
                'e_latest_join.enrollment_id',
                'e_join.enrollment_id',
                'latest_app_version.data_snapshot',

                'p_join.father_name',
                'p_join.father_occupation',
                'p_join.father_phone',
                'p_join.mother_name',
                'p_join.mother_occupation',
                'p_join.mother_phone',

                'sa_join.street',
                'sa_join.rt',
                'sa_join.rw',
                'sa_join.village',
                'sa_join.district',
                'sa_join.city_regency',
                'sa_join.province',
                'sa_join.other'
            );

            if ($joinMap['classes']) {
                $studentsQuery->groupBy('classes.class_id', 'classes.grade');
            }
            if ($joinMap['sections']) {
                $studentsQuery->groupBy('sections.section_id', 'sections.name');
            }
            if ($joinMap['school_years']) {
                $studentsQuery->groupBy('school_years.school_year_id', 'school_years.year');
            }
            if ($joinMap['transportations']) {
                $studentsQuery->groupBy('transportations.transport_id', 'transportations.type');
            }

            // pagination
            $perPage = min(max((int) $request->input('per_page', 50), 1), 100);
            $students = $studentsQuery->paginate($perPage);


            $data = $students->getCollection()->map(function ($student) {
                $enrollment = $student->enrollments->first();

                $address = trim(implode(', ', array_filter([
                    $student->street, 
                    ($student->rt && $student->rw) ? "{$student->rt}/{$student->rw}" : "-", 
                    $student->village, 
                    $student->district, 
                    $student->city_regency, 
                    $student->province, 
                    $student->other, 
                ])));

                $address = $address ?: null;

                $photoPath = $student->photo_path;
                $photoUrl = null;
                
                if (isset($student->latest_data_snapshot)) {
                    $decoded = json_decode($student->latest_data_snapshot);
                    $photoUrl = $decoded->request_data->photo_url ?? null;

                    if ($photoPath) {
                        $photoUrl = URL::to("api/storage-file/{$photoPath}"); 
                    }
                }
                
                unset($student->latest_data_snapshot); 
                
                return [
                    'photo' => $photoPath,
                    'photo_url' => $photoUrl,
                    'student_id' => $student->student_id,
                    'full_name' => $this->joinNameParts($student),
                    'first_name' => $this->namePart($student->first_name),
                    'middle_name' => $this->namePart($student->middle_name),
                    'last_name' => $this->namePart($student->last_name),
                    'grade' => $enrollment?->schoolClass?->grade,
                    'section' => $enrollment?->section?->name,
                    'major' => $enrollment?->major?->name,
                    'school_year' => $enrollment?->schoolYear?->year,
                    'gender' => $student->gender,
                    'registration_date' => $enrollment?->registration_date,
                    'transportation' => $enrollment?->transportation?->type,
                    'nisn' => $student->nisn,
                    'family_rank' => $student->family_rank,
                    'place_dob' => "{$student->place_of_birth}, {$student->date_of_birth}",
                    'age' => $student->age,
                    'religion' => $student->religion,
                    'citizenship' => $student->citizenship,
                    'country' => $student->country,
                    'previous_school' => $student->previous_school,
                    'address' => $address,
                    'phone' => $student->phone_number,
                    'father_name' => $student->father_name,
                    'father_occupation' => $student->father_occupation,
                    'father_phone' => $student->father_phone,
                    'mother_name' => $student->mother_name,
                    'mother_occupation' => $student->mother_occupation,
                    'mother_phone' => $student->mother_phone,
                    'nik' => $student->nik,
                    'kitas' => $student->kitas,
                ];
            });

            $students->setCollection($data);

            return response()->json([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'current_page' => $students->currentPage(),
                    'per_page' => $students->perPage(),
                    'total' => $students->total(),
                    'last_page' => $students->lastPage(),
                ],
            ], 200);
        } catch (Exception $e) {
            Log::error('Logbook Index Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve logbook data.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function export (Request $request) {
        if ($invalid = $this->invalidLogbookQuery($request)) {
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

            if (!$defaultSchoolYearId) {
                return response()->json([
                    'success' => false,
                    'error' => 'Active school year not found.',
                ], 404);
            }

            $targetSchoolYearIds = [];

            if ($schoolYearsRequest = $request->input('school_years')) {
                $targetSchoolYearIds = SchoolYear::whereIn('year', (array)$schoolYearsRequest)
                                                ->pluck('school_year_id')
                                                ->toArray();
            } else {
                $targetSchoolYearIds[] = $defaultSchoolYearId;
            }

            $latestEnrollmentSub = DB::table('enrollments AS e_latest')
                ->select('e_latest.id AS student_id', 'e_latest.school_year_id', DB::raw('MAX(e_latest.semester_id) AS max_semester_id'))
                ->whereIn('e_latest.school_year_id', $targetSchoolYearIds)
                ->groupBy('e_latest.id', 'e_latest.school_year_id');

            $latestEnrollmentIdSub = DB::table('enrollments AS e_id')
                ->select('e_id.enrollment_id', 'e_id.id AS student_id', 'e_id.school_year_id')
                ->joinSub($latestEnrollmentSub, 'latest_e_sub', function ($join) {
                    $join->on('e_id.id', '=', 'latest_e_sub.student_id')
                            ->on('e_id.school_year_id', '=', 'latest_e_sub.school_year_id')
                            ->on('e_id.semester_id', '=', 'latest_e_sub.max_semester_id');
                })
                ->groupBy('e_id.enrollment_id', 'e_id.id', 'e_id.school_year_id');

            $latestApplicationVersionSub = DB::table('application_form_versions AS afv')
            ->select('afv.application_id', 'afv.data_snapshot')
            ->join('application_forms AS af', 'af.application_id', '=', 'afv.application_id')
            ->whereRaw('afv.version_id = (
                SELECT MAX(afv2.version_id) 
                FROM application_form_versions AS afv2
                WHERE afv2.application_id = afv.application_id
            )');
            
            $studentsQuery = Student::where('active', 'YES')
                ->select('students.*') 
                ->addSelect('latest_app_version.data_snapshot as latest_data_snapshot') 
                ->addSelect(
                    'p_join.father_name',
                    'p_join.father_occupation',
                    'p_join.father_phone',
                    'p_join.mother_name',
                    'p_join.mother_occupation',
                    'p_join.mother_phone'
                )
                ->addSelect(
                    'sa_join.street',
                    'sa_join.rt',
                    'sa_join.rw',
                    'sa_join.village',
                    'sa_join.district',
                    'sa_join.city_regency',
                    'sa_join.province',
                    'sa_join.other'
                )
                ->with([
                    'enrollments' => function ($q) use ($targetSchoolYearIds, $latestEnrollmentIdSub) {
                        $latestIds = $latestEnrollmentIdSub->pluck('enrollment_id');
                        $q->whereIn('enrollment_id', $latestIds);
                        $q->whereIn('school_year_id', $targetSchoolYearIds);
                        $q->orderBy('semester_id', 'desc'); 
                        $q->with(['schoolClass', 'section', 'schoolYear', 'transportation', 'major']);
                    },
                ])
                ->joinSub($latestEnrollmentIdSub, 'e_latest_join', function ($join) {
                    $join->on('students.id', '=', 'e_latest_join.student_id');
                })
                ->leftJoin('parents AS p_join', function ($join) {
                    $join->on('p_join.enrollment_id', '=', 'e_latest_join.enrollment_id');
                    $join->on('p_join.id', '=', 'students.id'); 
                })
                ->leftJoin('student_addresses AS sa_join', function ($join) {
                    $join->on('sa_join.enrollment_id', '=', 'e_latest_join.enrollment_id');
                    $join->on('sa_join.id', '=', 'students.id'); 
                })
                ->join('enrollments AS e_join', 'e_join.enrollment_id', '=', 'e_latest_join.enrollment_id') 
                ->join('application_forms AS af_join', 'af_join.enrollment_id', '=', 'e_latest_join.enrollment_id')
                ->leftJoinSub($latestApplicationVersionSub, 'latest_app_version', function ($join) {
                    $join->on('latest_app_version.application_id', '=', 'af_join.application_id');
                });

            $studentsQuery->where('af_join.status', 'Confirmed');

            $filterSchoolYearIds = $targetSchoolYearIds; 

            // Filter (search)
            if ($name = $request->input('search_name')) {
                $studentsQuery->where(function ($q) use ($name) {
                    $q->whereRaw("CONCAT(first_name, ' ', COALESCE(middle_name, ''), ' ', last_name) LIKE ?", ["%{$name}%"]);
                });
            }

            if ($family = $request->input('search_family_rank')) {
                $studentsQuery->where('family_rank', 'like', "%$family%");
            }

            if ($religion = $request->input('search_religion')) {
                $studentsQuery->where('religion', 'like', "%$religion%");
            }
            
            if ($country = $request->input('search_country')) {
                $studentsQuery->where('country', 'like', "%$country%");
            }

            if ($previousSchool = $request->input('search_previous_school')) {
                $studentsQuery->where('students.previous_school', 'like', "%$previousSchool%");
            }

            if ($father = $request->input('search_father')) {
                $studentsQuery->where('p_join.father_name', 'like', "%$father%");
            }

            if ($mother = $request->input('search_mother')) {
                $studentsQuery->where('p_join.mother_name', 'like', "%$mother%");
            }

            $joinMap = [
                'enrollments' => true,
                'classes' => false,
                'sections' => false,
                'school_years' => false,
                'transportations' => false,
                'parents' => true,
            ];

            // Fiter (checkbox)
            if ($grades = $request->input('grades')) {
                if (!$joinMap['classes']) {
                    $studentsQuery->leftJoin('classes', 'e_join.class_id', '=', 'classes.class_id');
                    $joinMap['classes'] = true;
                }
                $studentsQuery->whereIn('classes.grade', (array)$grades);
            }

            if ($sections = $request->input('sections')) {
                if (!$joinMap['sections']) {
                    $studentsQuery->leftJoin('sections', 'e_join.section_id', '=', 'sections.section_id');
                    $joinMap['sections'] = true;
                }
                $studentsQuery->whereIn('sections.name', (array)$sections);
            }

            if ($schoolYears = $request->input('school_years')) {
                $studentsQuery->whereIn('e_latest_join.school_year_id', $targetSchoolYearIds);
            }

            if ($genders = $request->input('genders')) {
                $studentsQuery->whereIn('gender', (array)$genders);
            }

            if ($citizenships = $request->input('citizenships')) {
                $studentsQuery->whereIn('students.citizenship', (array)$citizenships);
            }

            if ($majors = $request->input('majors')) {
                $studentsQuery->whereIn('e_join.major_id', (array)$majors);
            }

            if ($transportations = $request->input('transportations')) {
                if (!$joinMap['transportations']) {
                    $studentsQuery->leftJoin('transportations', 'e_join.transport_id', '=', 'transportations.transport_id');
                    $joinMap['transportations'] = true;
                }
                $studentsQuery->whereIn('transportations.type', (array)$transportations);
            }

            // Filter (range)
            if ($request->filled('start_date') && $request->filled('end_date')) {
                $studentsQuery->whereBetween('e_join.registration_date', [
                    $request->input('start_date'), 
                    $request->input('end_date')
                ]);
            }

            if ($request->filled('min_age') && $request->filled('max_age')) {
                $studentsQuery->whereBetween('age', [
                    $request->input('min_age'), 
                    $request->input('max_age')
                ]);
            }

            // Sort
            $sortable = [
                'student_id',
                'full_name',
                'first_name',
                'middle_name',
                'last_name',
                'grade',
                'section',
                'major',
                'school_year',
                'gender',
                'registration_date',
                'transportation',
                'family_rank',
                'age',
                'religion',
                'citizenship',
                'country',
                'previous_school',
                'father_name',
                'father_occupation',
                'mother_name',
                'mother_occupation',
            ];

            $sorts = $request->input('sort', []);

            foreach ($sorts as $sort) {
                $field = $sort['field'] ?? null;
                $order = strtolower($sort['order'] ?? 'asc') === 'desc' ? 'desc' : 'asc';

                if (!$field || !in_array($field, $sortable)) continue;

                if (!collect($studentsQuery->getQuery()->columns)->contains('e_join.enrollment_id')) {
                    $studentsQuery->addSelect('e_join.enrollment_id');
                }

                switch ($field) {
                    case 'student_id':
                        $studentsQuery->orderByRaw("CAST(students.student_id AS UNSIGNED) $order");
                        break;

                    case 'full_name':
                        $studentsQuery->orderByRaw("CONCAT(COALESCE(students.first_name,''), ' ', COALESCE(students.middle_name, ''), ' ', COALESCE(students.last_name,'')) $order");
                        break;

                    case 'grade':
                        if (!$joinMap['classes']) {
                            $studentsQuery->leftJoin('classes', 'e_join.class_id', '=', 'classes.class_id');
                            $joinMap['classes'] = true;
                        }
                        $studentsQuery->orderBy('classes.grade', $order);
                        break;

                    case 'section':
                        if (!$joinMap['sections']) {
                            $studentsQuery->leftJoin('sections', 'e_join.section_id', '=', 'sections.section_id');
                            $joinMap['sections'] = true;
                        }
                        $studentsQuery->orderBy('sections.name', $order);
                        break;

                    case 'school_year':
                        if (!$joinMap['school_years']) {
                            $studentsQuery->leftJoin('school_years', 'e_join.school_year_id', '=', 'school_years.school_year_id');
                            $joinMap['school_years'] = true;
                        }
                        $studentsQuery->orderBy('school_years.year', $order);
                        break;

                    case 'major':
                        $studentsQuery->orderByRaw("(SELECT majors.name FROM majors WHERE majors.major_id = e_join.major_id) $order");
                        break;

                    case 'registration_date':
                        $studentsQuery->orderBy('e_join.registration_date', $order);
                        break;

                    case 'transportation':
                        if (!$joinMap['transportations']) {
                            $studentsQuery->leftJoin('transportations', 'e_join.transport_id', '=', 'transportations.transport_id');
                            $joinMap['transportations'] = true;
                        }
                        $studentsQuery->orderBy('transportations.type', $order);
                        break;

                    case 'age':
                        $dobOrder = ($order === 'asc') ? 'desc' : 'asc';
                        $studentsQuery->orderBy('students.date_of_birth', $dobOrder);
                        break;

                    case 'religion':
                        $studentsQuery->orderByRaw("CAST(students.religion AS CHAR) $order");
                        break;

                    case 'father_name':
                    case 'father_occupation':
                    case 'mother_name':
                    case 'mother_occupation':
                        $studentsQuery->orderBy("p_join.$field", $order);
                        break;

                    default:
                        $studentsQuery->orderBy("students.$field", $order);
                        break;
                }
            }

            $studentsQuery->groupBy(
                'students.id',
                'students.student_id',
                'students.studentall_id',
                'students.first_name',
                'students.middle_name',
                'students.last_name',
                'students.nickname',
                'students.citizenship',
                'students.gender',
                'students.age',
                'students.nisn',
                'students.family_rank',
                'students.place_of_birth',
                'students.date_of_birth',
                'students.email',
                'students.previous_school',
                'students.religion',
                'students.country',
                'students.active',
                'students.status',
                'students.photo_path',
                'students.phone_number',
                'students.nik',
                'students.kitas',
                'students.academic_status',
                'students.academic_status_other',
                'students.registration_date',
                'students.va_mandiri',
                'students.va_bca',
                'students.va_bni',
                'students.va_bri',
                'students.updated_at', 
                'students.graduated_at',
                'students.card_number',
                'e_latest_join.enrollment_id', 
                'e_join.enrollment_id', 
                'latest_app_version.data_snapshot',

                'p_join.father_name',
                'p_join.father_occupation',
                'p_join.father_phone',
                'p_join.mother_name',
                'p_join.mother_occupation',
                'p_join.mother_phone',

                'sa_join.street',
                'sa_join.rt',
                'sa_join.rw',
                'sa_join.village',
                'sa_join.district',
                'sa_join.city_regency',
                'sa_join.province',
                'sa_join.other'
            );

            if ($joinMap['classes']) {
                $studentsQuery->groupBy('classes.class_id', 'classes.grade');
            }
            if ($joinMap['sections']) {
                $studentsQuery->groupBy('sections.section_id', 'sections.name');
            }
            if ($joinMap['school_years']) {
                $studentsQuery->groupBy('school_years.school_year_id', 'school_years.year');
            }
            if ($joinMap['transportations']) {
                $studentsQuery->groupBy('transportations.transport_id', 'transportations.type');
            }

            $students = $studentsQuery->get();

            $data = $students->map(function ($student) {
                $enrollment = $student->enrollments->first();

                $address = trim(implode(', ', array_filter([
                    $student->street, 
                    ($student->rt && $student->rw) ? "{$student->rt}/{$student->rw}" : "-", 
                    $student->village, 
                    $student->district, 
                    $student->city_regency, 
                    $student->province, 
                    $student->other, 
                ])));

                $address = $address ?: null;

                $photoPath = $student->photo_path;
                $photoUrl = null;
                
                if (isset($student->latest_data_snapshot)) {
                    $decoded = json_decode($student->latest_data_snapshot);
                    $photoUrl = $decoded->request_data->photo_url ?? null;

                    if ($photoPath) {
                        $photoUrl = URL::to("api/storage-file/{$photoPath}"); 
                    }
                }
                
                unset($student->latest_data_snapshot); 
                
                return [
                    'photo' => $photoPath,
                    'photo_url' => $photoUrl,
                    'student_id' => $student->student_id,
                    'full_name' => $this->joinNameParts($student),
                    'first_name' => $this->namePart($student->first_name),
                    'middle_name' => $this->namePart($student->middle_name),
                    'last_name' => $this->namePart($student->last_name),
                    'grade' => $enrollment?->schoolClass?->grade,
                    'section' => $enrollment?->section?->name,
                    'major' => $enrollment?->major?->name,
                    'school_year' => $enrollment?->schoolYear?->year,
                    'gender' => $student->gender,
                    'registration_date' => $enrollment?->registration_date,
                    'transportation' => $enrollment?->transportation?->type,
                    'nisn' => $student->nisn,
                    'family_rank' => $student->family_rank,
                    'place_dob' => "{$student->place_of_birth}, {$student->date_of_birth}",
                    'age' => $student->age,
                    'religion' => $student->religion,
                    'citizenship' => $student->citizenship,
                    'country' => $student->country,
                    'previous_school' => $student->previous_school,
                    'address' => $address,
                    'phone' => $student->phone_number,
                    'father_name' => $student->father_name,
                    'father_occupation' => $student->father_occupation,
                    'father_phone' => $student->father_phone,
                    'mother_name' => $student->mother_name,
                    'mother_occupation' => $student->mother_occupation,
                    'mother_phone' => $student->mother_phone,
                    'nik' => $student->nik,
                    'kitas' => $student->kitas,
                ];
            });

            return response()->json([
                'success' => true,
                'data' => $data,
            ], 200);
        } catch (Exception $e) {
            Log::error('Logbook Export Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to export logbook data.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /**
     * One part of a student's name for display. Missing parts and placeholders typed
     * into the form ("-", "NULL", "N/A") come back as an empty string, so the table and
     * the export show an empty cell.
     */
    private function namePart($value): string
    {
        $value = trim((string) $value);

        return in_array(strtoupper($value), ['-', 'NULL', 'N/A', 'NA', '.'], true) ? '' : $value;
    }

    /** Full name from the parts that are filled in, separated by single spaces. */
    private function joinNameParts($student): string
    {
        return implode(' ', array_filter([
            $this->namePart($student->first_name),
            $this->namePart($student->middle_name),
            $this->namePart($student->last_name),
        ], fn ($part) => $part !== ''));
    }

    /** Same query parameters for the list and the export. */
    private function invalidLogbookQuery(Request $request)
    {
        return $this->invalidListQuery(
            $request,
            ['search_name', 'search_family_rank', 'search_religion', 'search_country', 'search_previous_school', 'search_father', 'search_mother'],
            ['start_date', 'end_date'],
            true
        );
    }
}
