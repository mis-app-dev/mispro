<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use App\Models\SchoolYear;
use Illuminate\Http\Request;
use App\Services\AnalyticsService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class AnalyticsController extends Controller
{
    protected $analyticsService;

    public function __construct(AnalyticsService $analyticsService)
    {
        $this->analyticsService = $analyticsService;
    }

    public function index (Request $request) 
    {
        try {
            $now = Carbon::now();
            $dateKey = $now->format('Y-m-d');

            $currentYearInt = $now->year;
            $startYear = $now->month >= 7 ? $currentYearInt : $currentYearInt - 1;

            $currentSyName = $startYear . '/' . ($startYear + 1);
            $prevSyName = ($startYear - 1) . '/' . $startYear;
            $nextSyName = ($startYear + 1) . '/' . ($startYear + 2);

            // Cache Key
            $cacheKey = 'analytics_full_v2_' . $dateKey;

            if ($request->has('refresh') && $request->refresh == 'true') {
                Cache::forget($cacheKey);
            }
            
            $cacheTime = now()->addHours(24);

            $data = Cache::remember($cacheKey, $cacheTime, function () use ($now, $dateKey, $currentSyName, $prevSyName, $nextSyName, $startYear, $currentYearInt) { 
                // Get IDs for School Years
                $syMap = SchoolYear::whereIn('year', [$currentSyName, $prevSyName, $nextSyName])->pluck('school_year_id', 'year');
                $currSyId = $syMap[$currentSyName] ?? null;
                $prevSyId = $syMap[$prevSyName] ?? null;
                $nextSyId = $syMap[$nextSyName] ?? null;

                $startOfDay = $now->copy()->startOfDay();

                // 1. TOTAL REGISTRATION (Global)
                $globalStats = $this->analyticsService->getGlobalRegistrationStats();
                $prevGlobalStats = $this->analyticsService->getGlobalRegistrationStats($startOfDay);

                // 2. DAILY REGISTRATION
                $todayStats = $this->analyticsService->getDailyReport($dateKey, true);

                // 3. YEARLY REGISTRATION
                $currSyStats = $this->analyticsService->getYearlyReport($currSyId, $prevSyId, true);

                // 4. PRE-REGISTER REGISTRATION
                $preRegStats = $this->analyticsService->getPreRegReport($nextSyId, $currSyId, true);

                // 6. ACTIVE STUDENTS
                $activeStudents = $this->analyticsService->getActiveStudentsBySection($currSyId, true);

                // 6b. CITIZENSHIP (active students, overall and per level)
                $citizenship = $this->analyticsService->getCitizenshipBreakdown($currSyId);

                // 7. TRENDS
                $monthlyTrend = $this->analyticsService->getMonthlyTrend($currentYearInt);
                $multiYearTrend = $this->analyticsService->getMultiYearTrend($startYear);

                // 8. Enrollment Unique Served
                $enrollmentFinal = $this->analyticsService->getUniqueServedStudents();

                return [
                    'meta' => [
                        'date' => $dateKey,
                        'current_sy' => $currentSyName,
                        'previous_sy' => $prevSyName,
                        'next_sy' => $nextSyName
                    ],
                    'global' => [
                        'total' => $globalStats['total'],
                        'total_growth' => $this->analyticsService->calculateGrowth($globalStats['total'], $prevGlobalStats['total']),
                        'confirmed' => $globalStats['confirmed'],
                        'confirmed_growth' => $this->analyticsService->calculateGrowth($globalStats['confirmed'], $prevGlobalStats['confirmed']),
                        'cancelled' => $globalStats['cancelled'],
                        'cancelled_growth' => $this->analyticsService->calculateGrowth($globalStats['cancelled'], $prevGlobalStats['cancelled']),
                    ],
                    'today' => $todayStats,
                    'school_year' => $currSyStats,
                    'pre_register' => $preRegStats,
                    'active_students_matrix' => $activeStudents,
                    'citizenship' => $citizenship,
                    'monthly_trends' => [
                        'labels' => $monthlyTrend['labels'],
                        'current_data' => $monthlyTrend['current_data'],
                        'previous_data' => $monthlyTrend['previous_data'],
                        'current_label' => (string) $currentYearInt,
                        'previous_label' => (string) ($currentYearInt - 1)
                    ],
                    'multi_year_trend' => $multiYearTrend,
                    'enrollment_unique_students' => $enrollmentFinal,
                ];
            });

            return response()->json([
                'success' => true,
                'data' => $data
            ]);
        } catch (\Exception $e) {
            Log::error('Analytics Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);            
            
            return response()->json([
                'success' => false, 
                'message' => 'Error loading analytics',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }
}