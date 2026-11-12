<?php

namespace App\Helpers;

use App\Models\SchoolYear;

class SchoolYearHelper
{
    /**
     * Mengembalikan current school year dalam format string "YYYY/YYYY"
     */
    public static function getCurrentSchoolYear(): ?string
    {
        $currentMonth = now()->month;
        $currentYear = now()->year;

        $schoolYearStr = ($currentMonth >= 7)
            ? $currentYear . '/' . ($currentYear + 1)
            : ($currentYear - 1) . '/' . $currentYear;

        $currentSchoolYear = SchoolYear::where('year', $schoolYearStr)->first();

        if (!$currentSchoolYear) {
            return null; // jika tidak ditemukan, kembalikan null
        }

        return $currentSchoolYear->year; // <-- sekarang return string "YYYY/YYYY"
    }

    /**
     * The SchoolYear row of the running school year (July to June), or null if it has not
     * been added yet.
     */
    public static function current(): ?SchoolYear
    {
        $month = now()->month;
        $year = now()->year;
        $name = ($month >= 7) ? $year . '/' . ($year + 1) : ($year - 1) . '/' . $year;

        return SchoolYear::where('year', $name)->first();
    }

    /**
     * True when $schoolYearId is a later school year than $current ("2027/2028" after
     * "2026/2027"). Years are compared by name, which sorts correctly for "YYYY/YYYY".
     */
    public static function isAfter(?int $schoolYearId, ?SchoolYear $current): bool
    {
        if (!$schoolYearId || !$current) {
            return false;
        }

        $year = SchoolYear::where('school_year_id', $schoolYearId)->value('year');

        return $year !== null && strcmp($year, $current->year) > 0;
    }
}