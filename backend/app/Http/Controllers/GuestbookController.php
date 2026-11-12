<?php

namespace App\Http\Controllers;

use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

use App\Models\Guestbook;
use App\Models\GuestbookVisitor;
use App\Models\GuestbookStudent;

class GuestbookController extends Controller
{
    public function index(Request $request)
    {
        try {
            $query = Guestbook::with(['visitors', 'students.schoolClass']);

            // 🔍 SEARCH
            if ($search = $request->input('search_name')) {
                $query->where(function ($q) use ($search) {
                    $q->whereHas('visitors', function ($v) use ($search) {
                        $v->where('name', 'like', "%$search%");
                    })
                    ->orWhereHas('students', function ($s) use ($search) {
                        $s->where('student_name', 'like', "%$search%");
                    });
                });
            }

            // 🎓 FILTER CLASS
            if ($class = $request->input('class_id')) {
                $query->whereHas('students', function ($q) use ($class) {
                    $q->whereIn('class_id', (array)$class);
                });
            }

            // 📅 DATE RANGE
            if ($request->filled('start_date')) {
                $query->whereDate('date_visit', '>=', $request->start_date);
            }

            if ($request->filled('end_date')) {
                $query->whereDate('date_visit', '<=', $request->end_date);
            }

            // 🔥 SORT (FIXED & SAFE)
            $sortable = ['guestbook_id', 'date_visit'];
            $sorts = $request->input('sort', []);

            // normalize ke array
            if (!is_array($sorts)) {
                $sorts = [];
            }

            if (isset($sorts['field'])) {
                $sorts = [$sorts];
            } else {
                $sorts = array_values($sorts);
            }

            foreach ($sorts as $sort) {
                if (!is_array($sort)) continue;

                $field = $sort['field'] ?? null;
                $order = strtolower($sort['order'] ?? 'asc');

                if ($field && in_array($field, $sortable)) {
                    $query->orderBy($field, $order === 'desc' ? 'desc' : 'asc');
                }
            }

            // default sort kalau tidak ada order
            if ($query->getQuery()->orders === null) {
                $query->orderBy('date_visit', 'desc');
            }

            // 📄 PAGINATION
            $perPage = min(max((int) $request->input('per_page', 25), 1), 100);
            $guestbooks = $query->paginate($perPage);

            // 🔁 FORMAT DATA
            $data = $guestbooks->getCollection()->map(function ($item) {
                return [
                    'id' => $item->guestbook_id,
                    'date_visit' => $item->date_visit,
                    'address' => $item->address,
                    'contact' => $item->contact,
                    'remarks' => $item->remarks,

                    'visitors' => $item->visitors->map(fn($v) => [
                        'name' => $v->name,
                        'relation' => $v->relation,
                    ]),

                    'students' => $item->students->map(function ($s) {
                        return [
                            'name' => $s->student_name,
                            'class_id' => $s->class_id,
                            'grade' => optional($s->schoolClass)->grade ?? '-',
                            'previous_school' => $s->previous_school,
                        ];
                    }),
                ];
            });

            return response()->json([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'current_page' => $guestbooks->currentPage(),
                    'per_page' => $guestbooks->perPage(),
                    'total' => $guestbooks->total(),
                    'last_page' => $guestbooks->lastPage(),
                ],
            ], 200);

        } catch (Exception $e) {
            Log::error('Guestbook Index Error', [
                'message' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve guestbook data.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function store(Request $request)
    {
        $request->validate([
            'date_visit' => 'required|date',
            'address' => 'required|string',
            'contact' => 'required|string',

            'visitors' => 'required|array|min:1',
            'visitors.*.name' => 'required|string|min:1',
            'visitors.*.relation' => 'nullable|string|max:100',

            'students' => 'required|array|min:1',
            'students.*.name' => 'required|string|min:1',
            'students.*.class_id' => 'required|exists:classes,class_id',
        ]);

        DB::beginTransaction();

        try {
            $guestbook = Guestbook::create([
                'date_visit' => Carbon::createFromFormat('Y-m-d H:i:s', $request->date_visit, 'Asia/Makassar'),
                'address' => $request->address,
                'contact' => $request->contact,
                'remarks' => $request->remarks,
            ]);

            foreach ($request->visitors as $visitor) {
                GuestbookVisitor::create([
                    'guestbook_id' => $guestbook->guestbook_id,
                    'name' => trim($visitor['name']),
                    'relation' => isset($visitor['relation'])
                        ? substr(trim($visitor['relation']), 0, 100)
                        : null,
                ]);
            }

            foreach ($request->students as $student) {
                GuestbookStudent::create([
                    'guestbook_id' => $guestbook->guestbook_id,
                    'student_name' => trim($student['name']),
                    'class_id' => $student['class_id'] ?? null,
                    'previous_school' => $student['previous_school'] ?? '',
                ]);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Guestbook created successfully'
            ]);
        } catch (\Throwable $e) {
            Log::error('Guestbook Store Error', [
                'message' => $e->getMessage(),
            ]);
            DB::rollBack();

            return response()->json([
                'success' => false,
                'message' => 'Failed to save guestbook data.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function update(Request $request, $id)
    {
        $request->validate([
            'date_visit' => 'required|date',
            'address' => 'required|string',
            'contact' => 'required|string',

            'visitors' => 'required|array|min:1',
            'visitors.*.name' => 'required|string|min:1',
            'visitors.*.relation' => 'nullable|string|max:100',

            'students' => 'required|array|min:1',
            'students.*.name' => 'required|string|min:1',
            'students.*.class_id' => 'required|exists:classes,class_id',
        ]);

        DB::beginTransaction();

        try {
            $guestbook = Guestbook::findOrFail($id);

            // Update main guestbook
            $guestbook->update([
                'date_visit' => Carbon::createFromFormat('Y-m-d H:i:s', $request->date_visit, 'Asia/Makassar'),
                'address' => $request->address,
                'contact' => $request->contact,
                'remarks' => $request->remarks,
            ]);

            // Delete old visitors & students
            GuestbookVisitor::where('guestbook_id', $id)->delete();
            GuestbookStudent::where('guestbook_id', $id)->delete();

            // Re-insert visitors
            foreach ($request->visitors as $visitor) {
                GuestbookVisitor::create([
                    'guestbook_id' => $id,
                    'name' => trim($visitor['name']),
                    'relation' => isset($visitor['relation'])
                        ? substr(trim($visitor['relation']), 0, 100)
                        : null,
                ]);
            }

            // Re-insert students
            foreach ($request->students as $student) {
                GuestbookStudent::create([
                    'guestbook_id' => $id,
                    'student_name' => trim($student['name']),
                    'class_id' => $student['class_id'] ?? null,
                    'previous_school' => $student['previous_school'] ?? '',
                ]);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Guestbook updated successfully'
            ]);
        } catch (\Throwable $e) {
            Log::error('Guestbook Update Error', [
                'message' => $e->getMessage(),
            ]);
            DB::rollBack();

            return response()->json([
                'success' => false,
                'message' => 'Failed to update guestbook data.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }
}