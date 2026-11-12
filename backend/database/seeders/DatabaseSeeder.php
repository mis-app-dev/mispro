<?php

namespace Database\Seeders;

use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;


class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        if (!env('ADMIN_EMAIL') || strlen((string) env('ADMIN_PASSWORD')) < 8) {
            $this->command?->warn('Admin account not seeded: set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 8 characters in .env.');
        } else {
            User::firstOrCreate(
                ['email' => env('ADMIN_EMAIL')],
                [
                    'username' => env('ADMIN_USERNAME'),
                    'full_name' => env('ADMIN_FULLNAME'),
                    'password' => Hash::make(env('ADMIN_PASSWORD')),
                    'role' => 'admin',
                ]
            );
        }

        $this->call([
            MasterDataSeeder::class,
            StudentOldSeeder::class,
        ]);
    }
}
