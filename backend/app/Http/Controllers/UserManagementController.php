<?php

namespace App\Http\Controllers;

use Exception;
use App\Models\User;
use App\Services\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Log; 

class UserManagementController extends Controller
{
    protected $auditTrail;

    public function __construct(AuditTrailService $auditTrail)
    {
        $this->auditTrail = $auditTrail;
    }

    public function index(Request $request)
    {
        if ($invalid = $this->invalidListQuery($request, ['search', 'username', 'full_name', 'email', 'sort_by', 'sort_dir'])) {
            return $invalid;
        }

        try {
            $query = User::select('user_id', 'username', 'full_name', 'email', 'role');

            if ($request->filled('search')) {
                $search = $request->search;

                $query->where(function ($q) use ($search) {
                    if (is_numeric($search)) {
                        $q->orWhere('user_id', $search);
                    }

                    $q->orWhere('username', 'LIKE', "%{$search}%")
                    ->orWhere('full_name', 'LIKE', "%{$search}%");
                });
            }

            if ($request->filled('user_id')) {
                $query->where('user_id', $request->user_id);
            }

            if ($request->filled('username')) {
                $query->where('username', 'LIKE', '%' . $request->username . '%');
            }

            if ($request->filled('full_name')) {
                $query->where('full_name', 'LIKE', '%' . $request->full_name . '%');
            }

            if ($request->filled('email')) {
                $query->where('email', 'LIKE', '%' . $request->email . '%');
            }

            if ($request->filled('role') && is_array($request->role)) {
                $query->whereIn('role', $request->role);
            }

            $sortable = ['user_id', 'username', 'full_name', 'role'];

            $sortBy = $request->get('sort_by');
            $sortDir = $request->get('sort_dir', 'asc');

            if (in_array($sortBy, $sortable)) {
                $sortDir = strtolower($sortDir) === 'desc' ? 'desc' : 'asc';
                $query->orderBy($sortBy, $sortDir);
            } else {
                $query->orderBy('created_at', 'desc');
            }

            $users = $query->paginate(25);

            return response()->json([
                'success' => true,
                'data' => $users,
            ]);

        } catch (Exception $e) {
            Log::error('User Management Index Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve users.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function store(Request $request)
    {
        $messages = [
            'username.unique' => 'The username (:input) has already been taken. Please choose a different username.',
            'password.min' => 'The password must be at least 8 characters.',
            'email.unique' => 'This email address is already registered. Please use another email.',
            'email.regex' => 'The email format is invalid. It must use the domain @mis-mdo.sch.id.',
        ];

        try {
            $validated = $request->validate([
                'username' => 'required|string|max:100|unique:users,username',
                'email' => [
                    'required',
                    'email',
                    'unique:users,email',
                    'regex:/^[A-Za-z0-9._%+-]+@mis-mdo\.sch\.id$/'
                ],
                'full_name' => 'required|string|max:255',
                'password' => 'required|min:8',
                'role' => ['required', Rule::in(['admin', 'head_registrar', 'registrar', 'teacher'])],
            ], $messages);

            $user = User::create([
                'username' => $validated['username'],
                'full_name' => $validated['full_name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'role' => $validated['role'],
            ]);
            
            $this->auditTrail->log('Create User', [
                'action' => 'Create',
                'user_id' => $user->user_id,
                'username' => $user->username,
                'role' => $user->role,
                'description' => "Created new user: {$user->username} ({$user->role})"
            ]);

            return response()->json([
                'success' => true,
                'message' => 'User created successfully',
                'data' => $user,
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $e->errors(),
            ], 422);
        } catch (Exception $e) {
            Log::error('User Management Store Error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to create user.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function update(Request $request, $user_id)
    {
        $messages = [
            'username.unique' => 'The username (:input) has already been taken by another user. Please choose a different username.',
            'password.min' => 'The password must be at least 8 characters.',
            'email.unique' => 'This email address is already registered to another user. Please use another email.',
            'email.regex' => 'The email format is invalid. It must use the domain @mis-mdo.sch.id.',
        ];

        try {
            $user = User::findOrFail($user_id);

            $validated = $request->validate([
                'username' => [
                    'sometimes',
                    'string',
                    'max:100',
                    Rule::unique('users', 'username')->ignore($user->user_id, 'user_id'),
                ],
                'email' => [
                    'sometimes', 
                    'email', 
                    Rule::unique('users', 'email')->ignore($user->user_id, 'user_id'),
                    'regex:/^[A-Za-z0-9._%+-]+@mis-mdo\.sch\.id$/'
                ],
                'full_name' => 'sometimes|string|max:255',
                'password' => 'nullable|min:8',
                'role' => ['sometimes', Rule::in(['admin', 'head_registrar', 'registrar', 'teacher'])],
            ], $messages);

            if (!empty($validated['password'])) {
                $validated['password'] = Hash::make($validated['password']);
            } else {
                unset($validated['password']);
            }

            $user->fill($validated);

            if ($user->isDirty()) {
                $changes = $user->getDirty();
                
                if (isset($changes['password'])) {
                    $changes['password'] = '******** (Password Changed)';
                }

                $user->save();

                $this->auditTrail->log('Update User', [
                    'action' => 'Update',
                    'user_id' => $user->user_id,
                    'username' => $user->username,
                    'changes' => $changes,
                    'description' => "Updated user details for {$user->username}"
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => 'User updated successfully',
                'data' => $user, 
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'User not found.',
            ], 404);
        } catch (Exception $e) {
            Log::error('User Management Update Error: ' . $e->getMessage(), [
                'user_id_target' => $user_id,
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to update user.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function destroy(Request $request, $user_id)
    {
        try {
            if (auth()->user()->role !== 'admin') {
                return response()->json([
                    'success' => false,
                    'message' => 'Authorization failed. Only administrators can delete users.',
                ], 403);
            }

            $user = User::findOrFail($user_id);

            if (auth()->id() === $user->user_id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete your own account.',
                ], 403);
            }

            if ($user->role === 'admin') {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete another admin.',
                ], 403);
            }

            $user->delete();

            $this->auditTrail->log('Delete User', [
                'action' => 'Delete',
                'user_id' => $user->user_id,
                'username' => $user->username,
                'deleted_data' => $user->only(['user_id', 'username', 'full_name', 'role']), // Helper 'only' mirip membuat array manual
                'description' => "Deleted user: {$user->username} ({$user->role})"
            ]);

            return response()->json([
                'success' => true,
                'message' => 'User deleted successfully',
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'User not found.',
            ], 404);
        } catch (Exception $e) {
            Log::error('User Management Destroy Error: ' . $e->getMessage(), [
                'user_id_target' => $user_id,
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to delete user.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }
}
