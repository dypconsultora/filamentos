<?php

namespace Database\Seeders;

use App\Models\Configuracion;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        User::firstOrCreate(
            ['usuario' => 'admin'],
            ['nombre' => 'Administrador', 'password' => 'Filamento2026']
        );

        Configuracion::actual();
    }
}
