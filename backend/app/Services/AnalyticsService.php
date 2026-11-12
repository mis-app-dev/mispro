<?php

namespace App\Services;

use App\Models\ApplicationForm;
use App\Models\CancelledRegistration;
use App\Models\SchoolYear;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class AnalyticsService
{
    public function calculateGrowth($current, $previous)
    {
        if ($previous > 0) {
            return round((($current - $previous) / $previous) * 100, 2);
        }
        return $previous === 0 && $current > 0 ? 100 : 0;
    }

    /**
     * @param string|null $beforeDate 
     */
    public function getGlobalRegistrationStats($beforeDate = null)
    {
        $regQuery = DB::table('application_forms');
        $cancelNewQuery = CancelledRegistration::where('reason', 'Cancellation of Enrollment')
            ->where('student_status', 'New');
        $cancelTransQuery = CancelledRegistration::where('reason', 'Cancellation of Enrollment')
            ->where('student_status', 'Transferee');
        
        // Filter untuk Global Growth (Data sebelum hari ini)
        if ($beforeDate) {
            $regQuery->where('created_at', '<', $beforeDate);
            $cancelNewQuery->where('cancelled_at', '<', $beforeDate);
            $cancelTransQuery->where('cancelled_at', '<', $beforeDate);
        }

        $regStats = $regQuery->selectRaw('
            COUNT(*) as total_registrations,
            COUNT(CASE WHEN status = "Confirmed" THEN 1 ELSE NULL END) as total_confirmed,
            COUNT(CASE WHEN status = "Cancelled" THEN 1 ELSE NULL END) as total_cancelled_af
        ')->first();

        // Count cancelled from table
        $cancelledNew = $cancelNewQuery->count();
        $cancelledTrans = $cancelTransQuery->count();

        $totalConfirmed = (int) ($regStats->total_confirmed ?? 0);
        $cancelledAF = (int) ($regStats->total_cancelled_af ?? 0);
        $totalCancelled = $cancelledAF + $cancelledNew + $cancelledTrans;
        $totalRegistrations = $totalConfirmed + $totalCancelled; 

        return [
            'total' => $totalRegistrations,
            'confirmed' => $totalConfirmed,
            'cancelled' => $totalCancelled
        ];
    }

    public function getDailyReport($date, $detailed = false)
    {
        $targetDate = Carbon::parse($date);
        
        $todayStart = $targetDate->copy()->startOfDay();
        $todayEnd = $targetDate->copy()->endOfDay();
        $yesterdayStart = $targetDate->copy()->subDay()->startOfDay();
        $yesterdayEnd = $targetDate->copy()->subDay()->endOfDay();

        $currentData = $this->getStats($todayStart, $todayEnd, null, $detailed);
        $prevData = $this->getStats($yesterdayStart, $yesterdayEnd, null, $detailed);

        return $this->appendGrowth($currentData, $prevData, $detailed);
    }

    public function getYearlyReport($currentSyId, $prevSyId, $detailed = false)
    {
        $currentData = $this->getStats(null, null, $currentSyId, $detailed);
        $prevData = $this->getStats(null, null, $prevSyId, $detailed);

        return $this->appendGrowth($currentData, $prevData, $detailed);
    }

    public function getPreRegReport($nextSyId, $currentSyId, $detailed = false)
    {
        $nextData = $this->getStats(null, null, $nextSyId, $detailed);
        $currentData = $this->getStats(null, null, $currentSyId, $detailed);
        
        return $this->appendGrowth($nextData, $currentData, $detailed);
    }

    private function appendGrowth($current, $previous, $detailed)
    {
        // Mode Simple (Dashboard)
        if (!$detailed) {
            $current['growth_total'] = $this->calculateGrowth($current['total'], $previous['total']);
            $current['growth_confirmed'] = $this->calculateGrowth($current['confirmed'], $previous['confirmed']);
            $current['growth_cancelled'] = $this->calculateGrowth($current['cancelled'], $previous['cancelled']);
            return $current;
        }

        // Mode Detailed (Analytics)
        foreach ($current as $key => $values) {
            $prevValues = $previous[$key] ?? ['total' => 0, 'confirmed' => 0, 'cancelled' => 0];
            
            $current[$key]['growth_total'] = $this->calculateGrowth($values['total'], $prevValues['total']);
            $current[$key]['growth_confirmed'] = $this->calculateGrowth($values['confirmed'], $prevValues['confirmed']);
            $current[$key]['growth_cancelled'] = $this->calculateGrowth($values['cancelled'], $prevValues['cancelled']);
        }

        return $current;
    }

    private function getStats($startDate = null, $endDate = null, $schoolYearId = null, $detailed = false)
    {
        $query = DB::table('application_forms')
            ->join('enrollments', 'application_forms.enrollment_id', '=', 'enrollments.enrollment_id');

        if ($schoolYearId) {
            $query->where('enrollments.school_year_id', $schoolYearId);
        } elseif ($startDate && $endDate) {
            $query->whereBetween('application_forms.created_at', [$startDate, $endDate]);
        } else {
            $empty = ['total' => 0, 'confirmed' => 0, 'cancelled' => 0, 'percentage' => 0];
            return $detailed 
                ? ['all' => $empty, 'new' => $empty, 'transferee' => $empty, 'returning' => $empty]
                : $empty;
        }

        $selects = [
            'SUM(CASE WHEN application_forms.status = "Confirmed" THEN 1 ELSE 0 END) as confirmed',
            'SUM(CASE WHEN application_forms.status = "Cancelled" THEN 1 ELSE 0 END) as cancelled_af'
        ];

        if ($detailed) {
            $selects[] = 'SUM(CASE WHEN enrollments.student_status = "New" AND application_forms.status = "Confirmed" THEN 1 ELSE 0 END) as new_confirmed';
            $selects[] = 'SUM(CASE WHEN enrollments.student_status = "New" AND application_forms.status = "Cancelled" THEN 1 ELSE 0 END) as new_cancelled_af';
            $selects[] = 'SUM(CASE WHEN enrollments.student_status = "Transferee" AND application_forms.status = "Confirmed" THEN 1 ELSE 0 END) as trans_confirmed';
            $selects[] = 'SUM(CASE WHEN enrollments.student_status = "Transferee" AND application_forms.status = "Cancelled" THEN 1 ELSE 0 END) as trans_cancelled_af';
        }

        $rawStats = $query->selectRaw(implode(',', $selects))->first();

        $countCancTable = function($status) use ($startDate, $endDate, $schoolYearId) {
            $q = CancelledRegistration::where('reason', 'Cancellation of Enrollment');
            if ($status) $q->where('student_status', $status);
            else $q->whereIn('student_status', ['New', 'Transferee']); 

            if ($schoolYearId) $q->where('school_year_id', $schoolYearId);
            elseif ($startDate && $endDate) $q->whereBetween('cancelled_at', [$startDate, $endDate]);
            return $q->count();
        };

        $v = fn($prop) => (int)($rawStats->$prop ?? 0);
        $grandConfirmed = $v('confirmed');
        $cancelledAF = $v('cancelled_af');

        if (!$detailed) {
            $cancelledInTable = $countCancTable(null);
            $totalCancelled = $cancelledAF + $cancelledInTable;
            return ['total' => $grandConfirmed + $totalCancelled, 'confirmed' => $grandConfirmed, 'cancelled' => $totalCancelled];
        }

        // Detailed Logic
        $cancNewTable = $countCancTable('New');
        $cancTransTable = $countCancTable('Transferee');

        // Helper build array stats
        $buildStat = function($conf, $canc) {
            return ['total' => $conf + $canc, 'confirmed' => $conf, 'cancelled' => $canc];
        };

        // A. New
        $newStat = $buildStat(
            $v('new_confirmed'), 
            $v('new_cancelled_af') + $cancNewTable
        );

        // B. Transferee
        $transStat = $buildStat(
            $v('trans_confirmed'), 
            $v('trans_cancelled_af') + $cancTransTable
        );

        // C. Grand Total
        $grandStat = $buildStat(
            $grandConfirmed,
            $cancelledAF + $cancNewTable + $cancTransTable
        );

        // D. Returning
        $oldTotal = max(0, $grandStat['total'] - ($newStat['total'] + $transStat['total']));
        $oldConfirmed = max(0, $grandStat['confirmed'] - ($newStat['confirmed'] + $transStat['confirmed']));
        $oldCancelled = max(0, $oldTotal - $oldConfirmed);
        
        $oldStat = ['total' => $oldTotal, 'confirmed' => $oldConfirmed, 'cancelled' => $oldCancelled];

        return [
            'all' => $grandStat,
            'new' => $newStat,
            'transferee' => $transStat,
            'returning' => $oldStat,
        ];
    }

    public function getUniqueServedStudents()
    {
        $sections = [
            'ECP' => ['ecp'], 
            'Elementary' => ['elementary'], 
            'Middle' => ['middle'], 
            'High' => ['high']
        ];

        $historicalEnrollments = DB::table('enrollments')
            ->join('application_forms', 'enrollments.enrollment_id', '=', 'application_forms.enrollment_id')
            ->join('sections', 'enrollments.section_id', '=', 'sections.section_id')
            ->join('students', 'enrollments.id', '=', 'students.id') 
            ->where(function($query) {
                $query->where('application_forms.status', 'Confirmed')
                        ->orWhere(function($subQuery) {
                            $subQuery->where('application_forms.status', 'Cancelled')
                                    ->whereIn('students.status', ['Graduate', 'Expelled', 'Withdraw']);
                        });
            })
            ->select(
                'students.id as student_id',
                'sections.name as section_name',
                'students.active',          
                'students.status as student_status'
            )
            ->get();
        
        $uniqueEnrollmentKeys = []; 
        $globalStats = [
            'total' => 0, 'active' => 0, 'graduate' => 0, 
            'expelled' => 0, 'withdraw' => 0, 'unknown' => 0
        ];

        $sectionStats = [];
        foreach ($sections as $label => $val) {
            $sectionStats[$label] = [
                'total' => 0, 'active' => 0, 'graduate' => 0, 
                'expelled' => 0, 'withdraw' => 0, 'unknown' => 0
            ];
        }

        foreach ($historicalEnrollments as $record) {
            $groupName = 'Other';
            foreach ($sections as $label => $keywords) {
                foreach ($keywords as $k) {
                    if (stripos($record->section_name, $k) !== false) {
                        $groupName = $label;
                        break 2;
                    }
                }
            }

            $compositeKey = $record->student_id . '_' . $groupName;

            if (!isset($uniqueEnrollmentKeys[$compositeKey])) {
                $uniqueEnrollmentKeys[$compositeKey] = true;

                $type = 'unknown'; 
                if ($record->active === 'YES') {
                    $type = 'active';
                } else {
                    $st = strtolower($record->student_status ?? '');
                    if (str_contains($st, 'graduate')) $type = 'graduate';
                    elseif (str_contains($st, 'expel')) $type = 'expelled';
                    elseif (str_contains($st, 'withdraw')) $type = 'withdraw';
                }

                $globalStats['total']++;
                $globalStats[$type] = ($globalStats[$type] ?? 0) + 1;

                if (isset($sectionStats[$groupName])) {
                    $sectionStats[$groupName]['total']++;
                    $sectionStats[$groupName][$type] = ($sectionStats[$groupName][$type] ?? 0) + 1;
                }
            }
        }

        return [
            'summary' => $globalStats,       
            'breakdown' => $sectionStats
        ];
    }

    public function getActiveStudentsBySection($schoolYearId, $detailed = false)
    {
        $activeStudents = []; 

        $sections = ['ECP' => ['ecp'], 'Elementary' => ['elementary'], 'Middle' => ['middle'], 'High' => ['high']];
        $result = ['ECP' => 0, 'Elementary' => 0, 'Middle' => 0, 'High' => 0];
        if (!$schoolYearId) return $result;

        $allActiveStudents = DB::table('students')
            ->join('enrollments', 'students.id', '=', 'enrollments.id')
            ->join('application_forms', 'enrollments.enrollment_id', '=', 'application_forms.enrollment_id')
            ->join('sections', 'enrollments.section_id', '=', 'sections.section_id')
            ->where('students.active', 'YES')
            ->where('application_forms.status', 'Confirmed')
            ->where('enrollments.school_year_id', $schoolYearId)
            ->select('students.id as student_id', 'enrollments.student_status', 'sections.name as section_name')
            ->distinct()->get();

        $globalNewStudentIds = $allActiveStudents
            ->where('student_status', 'New')
            ->pluck('student_id')
            ->unique();

        $grandTotalStats = [
            'total' => 0,
            'total_new' => 0,
            'total_transferee' => 0,
            'total_returning' => 0
        ];

        foreach ($sections as $label => $keywords) {
            $sectionData = $allActiveStudents->filter(function($item) use ($keywords) {
                foreach ($keywords as $key) {
                    if (stripos($item->section_name, $key) !== false) {
                        return true;
                    }
                }
                return false;
            });

            // 1. Total Unique
            $totalUnique = $sectionData->unique('student_id')->count();

            if (!$detailed) {
                $activeStudents[$label] = $totalUnique; 
                $grandTotalStats['total'] += $totalUnique;
                continue; 
            }

            // 2. Total New 
            $countNew = $sectionData
                ->where('student_status', 'New')
                ->unique('student_id')
                ->count();

            // 3. Total Transferee 
            $countTransferee = $sectionData
                ->where('student_status', 'Transferee')
                ->whereNotIn('student_id', $globalNewStudentIds) 
                ->unique('student_id')
                ->count();

            // 4. Total Returning
            $totalReturning = max(0, $totalUnique - ($countNew + $countTransferee));

            $activeStudents[$label] = [
                'total' => $totalUnique,
                'total_new' => $countNew,
                'total_transferee' => $countTransferee,
                'total_returning' => $totalReturning 
            ];

            $grandTotalStats['total'] += $totalUnique;
            $grandTotalStats['total_new'] += $countNew;
            $grandTotalStats['total_transferee'] += $countTransferee;
            $grandTotalStats['total_returning'] += $totalReturning;
        }

        if (!$detailed) {
            $activeStudents['Total'] = $grandTotalStats['total'];
        } else {
            $activeStudents['Total'] = $grandTotalStats;
        }

        return $activeStudents;
    }

    /**
     * Indonesian vs non-Indonesian active students of a school year, overall ('All') and per
     * level. Uses the same population as getActiveStudentsBySection (active, confirmed
     * registration in that year). Non-Indonesian students are also counted per country;
     * an empty country is reported as "Unknown".
     */
    public function getCitizenshipBreakdown($schoolYearId)
    {
        $levels = ['ECP' => 'ecp', 'Elementary' => 'elementary', 'Middle' => 'middle', 'High' => 'high'];
        $empty = fn () => ['total' => 0, 'indonesia' => 0, 'non_indonesia' => 0, 'countries' => []];

        $result = ['All' => $empty()];
        foreach ($levels as $label => $keyword) {
            $result[$label] = $empty();
        }

        if (!$schoolYearId) {
            return $result;
        }

        $rows = DB::table('students')
            ->join('enrollments', 'students.id', '=', 'enrollments.id')
            ->join('application_forms', 'enrollments.enrollment_id', '=', 'application_forms.enrollment_id')
            ->join('sections', 'enrollments.section_id', '=', 'sections.section_id')
            ->where('students.active', 'YES')
            ->where('application_forms.status', 'Confirmed')
            ->where('enrollments.school_year_id', $schoolYearId)
            ->select('students.id', 'students.citizenship', 'students.country', 'sections.name as section_name')
            ->distinct()
            ->get();

        $counted = [];

        foreach ($rows as $row) {
            $level = null;
            foreach ($levels as $label => $keyword) {
                if (stripos($row->section_name, $keyword) !== false) {
                    $level = $label;
                    break;
                }
            }

            $isForeign = $row->citizenship === 'Non Indonesia';
            $country = trim((string) $row->country);
            $country = $country === '' ? 'Unknown' : ucwords(strtolower($country));

            $targets = ['All'];
            if ($level) {
                $targets[] = $level;
            }

            foreach ($targets as $target) {
                // A student counts once per group, even with more than one enrollment row.
                if (isset($counted[$target][$row->id])) {
                    continue;
                }
                $counted[$target][$row->id] = true;

                $result[$target]['total']++;
                if ($isForeign) {
                    $result[$target]['non_indonesia']++;
                    $result[$target]['countries'][$country] = ($result[$target]['countries'][$country] ?? 0) + 1;
                } else {
                    $result[$target]['indonesia']++;
                }
            }
        }

        foreach ($result as $key => $stats) {
            arsort($stats['countries']);
            $list = [];
            foreach ($stats['countries'] as $name => $count) {
                $list[] = ['country' => $name, 'count' => $count];
            }
            $result[$key]['countries'] = $list;
        }

        return $result;
    }

    // Registration Trends
    public function getDailyTrend($date)
    {
        $targetDate = Carbon::parse($date);
        $monthStart = $targetDate->copy()->startOfMonth();
        $daysInMonth = $targetDate->daysInMonth;
        
        $trendData = [];

        for ($i = 0; $i < $daysInMonth; $i++) {
            $loopDate = $monthStart->copy()->addDays($i);
            $dStart = $loopDate->copy()->startOfDay();
            $dEnd = $loopDate->copy()->endOfDay();

            $dayStat = $this->getStats($dStart, $dEnd, null, false);

            $trendData[] = [
                'date' => $loopDate->format('d M'), 
                'full_date' => $loopDate->toDateString(),
                'total' => $dayStat['total'],
                'confirmed' => $dayStat['confirmed'],
                'cancelled' => $dayStat['cancelled'],
            ];
        }

        return $trendData;
    }

    public function getMonthlyTrend($year)
    {
        $trendLabels = [];
        $currTrendData = [];
        $prevTrendData = [];

        for ($i = 0; $i < 12; $i++) {
            $monthNum = $i;
            
            $monthName = Carbon::create()->month($monthNum)->format('M');
            $trendLabels[] = $monthName;

            // Current SY Date Range
            $currStart = Carbon::create($year, $monthNum, 1)->startOfDay();
            $currEnd = $currStart->copy()->endOfMonth()->endOfDay();

            // Previous SY Date Range
            $prevStart = Carbon::create($year - 1, $monthNum, 1)->startOfDay();
            $prevEnd = $prevStart->copy()->endOfMonth()->endOfDay();

            // Get Stats
            $currMonthStat = $this->getStats($currStart, $currEnd, null, false);
            $prevMonthStat = $this->getStats($prevStart, $prevEnd, null, false);

            $currTrendData[] = [
                'month' => $monthName,
                'total' => $currMonthStat['total'],
                'confirmed' => $currMonthStat['confirmed'],
                'cancelled' => $currMonthStat['cancelled']
            ];

            $prevTrendData[] = [
                'month' => $monthName,
                'total' => $prevMonthStat['total'],
                'confirmed' => $prevMonthStat['confirmed'],
                'cancelled' => $prevMonthStat['cancelled']
            ];
        }

        return [
            'labels' => $trendLabels,
            'current_data' => $currTrendData,
            'previous_data' => $prevTrendData
        ];
    }

    public function getMultiYearTrend($startYear)
    {
        $yearsList = [];
        $yearsData = [];

        for ($y = 4; $y >= 0; $y--) {
            $targetYear = $startYear - $y; 
            $syString = $targetYear . '/' . ($targetYear + 1); 
            $sId = SchoolYear::where('year', $syString)->value('school_year_id');
            
            $yStat = $this->getStats(null, null, $sId, false);
            
            $yearsList[] = $syString;
            $yearsData[] = [
                'school_year' => $syString,
                'total' => $yStat['total'],
                'confirmed' => $yStat['confirmed'],
                'cancelled' => $yStat['cancelled']
            ];
        }

        return [
            'labels' => $yearsList,
            'data' => $yearsData
        ];
    }
}