<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $tabla) {
            $tabla->id();
            $tabla->string('nombre', 80);
            $tabla->string('usuario', 40)->unique();
            $tabla->string('password');
            $tabla->rememberToken();
            $tabla->timestamps();
        });

        Schema::create('sessions', function (Blueprint $tabla) {
            $tabla->string('id')->primary();
            $tabla->foreignId('user_id')->nullable()->index();
            $tabla->string('ip_address', 45)->nullable();
            $tabla->text('user_agent')->nullable();
            $tabla->longText('payload');
            $tabla->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('sessions');
    }
};
