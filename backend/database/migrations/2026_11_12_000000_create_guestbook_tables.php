<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The guestbook tables were created directly in the production database and never had a
 * migration, so a fresh install had no guestbook. This creates them with the same structure
 * as production. Each table is skipped when it already exists, so running it on the live
 * server changes nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('guestbook')) {
            Schema::create('guestbook', function (Blueprint $table) {
                $table->increments('guestbook_id');
                $table->dateTime('date_visit')->useCurrent();
                $table->string('address', 255);
                $table->string('contact', 100);
                $table->text('remarks')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->dateTime('created_at')->nullable()->useCurrent();
                $table->dateTime('updated_at')->nullable()->useCurrent()->useCurrentOnUpdate();

                $table->foreign('created_by', 'fk_guestbook_created_by')
                    ->references('user_id')->on('users')
                    ->nullOnDelete()->cascadeOnUpdate();
            });
        }

        if (!Schema::hasTable('guestbook_students')) {
            Schema::create('guestbook_students', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('guestbook_id');
                $table->string('student_name', 100);
                $table->string('previous_school', 100)->nullable();
                $table->dateTime('created_at')->nullable()->useCurrent();
                $table->unsignedBigInteger('class_id');

                $table->foreign('guestbook_id', 'guestbook_students_ibfk_1')
                    ->references('guestbook_id')->on('guestbook')
                    ->cascadeOnDelete();
                $table->foreign('class_id', 'fk_guestbook_student_class')
                    ->references('class_id')->on('classes')
                    ->restrictOnDelete()->cascadeOnUpdate();
            });
        }

        if (!Schema::hasTable('guestbook_visitors')) {
            Schema::create('guestbook_visitors', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('guestbook_id');
                $table->string('name', 100);
                $table->string('relation', 100)->nullable();
                $table->dateTime('created_at')->nullable()->useCurrent();

                $table->foreign('guestbook_id', 'guestbook_visitors_ibfk_1')
                    ->references('guestbook_id')->on('guestbook')
                    ->cascadeOnDelete();
            });
        }
    }

    /**
     * Intentionally empty: on the live server these tables existed before this migration,
     * and a rollback must never delete the guestbook data.
     */
    public function down(): void
    {
    }
};
