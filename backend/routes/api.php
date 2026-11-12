<?php

use App\Models\SchoolYear;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\GuestbookController;
use App\Http\Controllers\LogbookController;
use App\Http\Controllers\StorageController;
use App\Http\Controllers\StudentController;
use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\MasterDataController;
use App\Http\Controllers\RegistrationController;
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\StudentsSyncController;

Route::middleware('throttle:login')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/reset-login', [AuthController::class, 'resetLogin']);
});

Route::get('/storage-file/{path}', [StorageController::class, 'serveFile'])
    ->where('path', '.*')
    ->middleware(['auth:sanctum', 'lifetime', 'cors']);

Route::middleware(['auth:sanctum', 'lifetime', 'role:admin'])->group(function () {
    Route::get('/audit-logs', [AuditLogController::class, 'index']);
    Route::get('/audit-logs/{id}', [AuditLogController::class, 'show']);
});

Route::middleware(['auth:sanctum', 'lifetime', 'role:admin,registrar,head_registrar,teacher'])->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index']);
});

Route::middleware(['auth:sanctum', 'lifetime','role:admin'])->group(function () {
    Route::get('/users', [UserManagementController::class, 'index']);
    Route::post('/users', [UserManagementController::class, 'store']);
    Route::patch('/users/{user_id}', [UserManagementController::class, 'update']);
    Route::delete('/users/{user_id}', [UserManagementController::class, 'destroy']);
});

Route::middleware('auth:sanctum', 'lifetime')->group(function() {
  Route::post('/logout', [AuthController::class, 'logout']);
  Route::get('/me', [AuthController::class, 'me']);
});

Route::get('/registration-option', [MasterDataController::class, 'getRegistrationOption']);
Route::middleware(['auth:sanctum', 'lifetime', 'role:admin,registrar'])->group(function () {
  Route::post('/school-year/add', [MasterDataController::class, 'addSchoolYear']);
});

Route::middleware(['auth:sanctum', 'lifetime', 'role:admin,registrar,head_registrar,teacher'])->group(function () {
  Route::prefix('students')->group(function () {
    Route::get('/', [StudentController::class, 'index']);
    Route::get('/search', [StudentController::class, 'searchStudents']);
    Route::get('/{id}/latest-application', [StudentController::class, 'getLatestApplication']);
    Route::patch('/{id}/update', [StudentController::class, 'updateStudent']);
    Route::get('/{id}/history-dates', [StudentController::class, 'getStudentHistoryDates']);
    Route::post('/{id}/card-number', [StudentController::class, 'storeCardNumber']);
  });
});

Route::middleware(['auth:sanctum', 'lifetime', 'role:admin,registrar,head_registrar'])->group(function () {
  Route::prefix('students')->group(function () {
    Route::get('/{id}/history/{versionId}', [StudentController::class, 'getHistoryDetail']);
    // Graduating students in bulk is not available to teachers.
    Route::post('/auto-graduate/preview', [StudentController::class, 'autoGraduatePreview']);
    Route::post('/auto-graduate/confirm', [StudentController::class, 'autoGraduateConfirm']);
  });
});

Route::middleware(['auth:sanctum', 'lifetime', 'role:admin,registrar,head_registrar'])->group(function () {
  Route::prefix('registration')->group(function () {
    Route::get('/', [RegistrationController::class, 'index']);
    Route::post('/start', [RegistrationController::class, 'startRegistration']);
    Route::get('/context/{draft_id}', [RegistrationController::class, 'getRegistrationContext']);
    Route::post('/store/{draft_id}', [RegistrationController::class, 'store']);
    Route::get('/preview/{applicationId}/version/{versionId}', [RegistrationController::class, 'showPreview']);
    Route::post('/{application_id}/cancel/{reason_type}', [RegistrationController::class, 'handleCancelRegistration']);
    Route::get('/cancelled-registrations', [RegistrationController::class, 'getCancelledRegistrations']);
  });
});

Route::middleware(['auth:sanctum', 'lifetime', 'role:admin,registrar,head_registrar,teacher'])->group(function () {
    Route::get('/logbook', [LogbookController::class, 'index']);
    Route::get('/logbook/export', [LogbookController::class, 'export']);
});

Route::middleware(['auth:sanctum', 'lifetime', 'role:admin,registrar,head_registrar,teacher'])->group(function () {
    Route::get('/guestbook', [GuestbookController::class, 'index']);
    Route::post('/guestbook', [GuestbookController::class, 'store']);
    Route::put('/guestbook/{id}', [GuestbookController::class, 'update']);
});

Route::middleware(['auth:sanctum', 'lifetime', 'role:admin,registrar,head_registrar'])->group(function () {
    Route::get('/analytics', [AnalyticsController::class, 'index']);
});

Route::prefix('v1/sync')->middleware(['sync.key', 'throttle:60,1'])->group(function () {
    Route::get('/students', [StudentsSyncController::class, 'index']);
});
?>