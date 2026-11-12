<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use App\Http\Controllers\Controller;
use App\Models\Student;
use Illuminate\Http\Request;

class StudentsSyncController extends Controller
{
    public function index(Request $request)
    {
        // 1. Tangkap parameter limit & page
        $limit = min(max((int) $request->input('limit', 100), 1), 500);
        $updatedAfter = $request->input('updated_after'); // Opsional: untuk Incremental Sync

        // 2. Query ke Database dengan Eager Loading
        $query = Student::with(['schoolClass', 'schoolYears']);

        // Filter incremental sync jika Go mengirimkan timestamp sync terakhir
        if ($updatedAfter) {
            $query->where('updated_at', '>=', $updatedAfter);
        }

        $paginated = $query->orderBy('id', 'asc')->paginate($limit);

        // 3. Format Response sesuai kebutuhan Go Backend
        $formattedData = $paginated->getCollection()->map(function ($student) {
            $latestClass = $student->schoolClass->last();
            $latestSchoolYear = $student->schoolYears->last();

            $gradeVal = $latestClass?->grade ?? '';
            $schoolYearName = $latestSchoolYear?->name ?? $latestSchoolYear?->year ?? '';

            // Format tanggal lahir dari kolom date_of_birth menjadi YYYY-MM-DD
            $birthDateFormatted = $student->date_of_birth 
                ? Carbon::parse($student->date_of_birth)->format('Y-m-d') 
                : '';

            // Gabungkan Nama Lengkap untuk Go Backend
            $fullName = trim(implode(' ', array_filter([
                $student->first_name,
                $student->middle_name,
                $student->last_name
            ])));

            // ==========================================
            // LOGIKA PENENTUAN STATUS is_active
            // ==========================================
            $activeField = strtoupper(trim($student->active ?? '')); 
            $statusField = strtolower(trim($student->status ?? ''));

            $isActive = false; // Default nilai

            if ($activeField === 'NO' && in_array($statusField, ['graduate', 'withdraw', 'expelled'])) {
                $isActive = false; // (0)
            } elseif ($activeField === 'YES' && $statusField === 'not graduate') {
                $isActive = true;  // (1)
            } else {
                // Fallback default jika data tidak sesuai persis dengan 2 kondisi di atas
                $isActive = ($activeField === 'YES');
            }
            // ==========================================

            return [
                'nis'           => $student->student_id,
                'nisn'          => $student->nisn ?? '',
                'full_name'     => $fullName ?: ($student->full_name ?? ''),
                'first_name'    => $student->first_name,
                'middle_name'   => $student->middle_name,
                'last_name'     => $student->last_name,
                'photo_uri'     => $student->photo_path
                    ? 'https://student_portal.manadoindependent.sch.id/storage/' . ltrim($student->photo_path, '/')
                    : '',
                'birth_date'    => $birthDateFormatted,
                'class_id'      => 0,
                'school_year'   => $schoolYearName,
                'academic_year' => $gradeVal ? 'Grade ' . $gradeVal : '',
                'is_active'     => $isActive, // Boolean true/false, akan terbaca 1/0 atau true/false di JSON
            ];
        });

        return response()->json([
            'status' => 'success',
            'data'   => $formattedData,
            'meta'   => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ]
        ], 200);
    }
}