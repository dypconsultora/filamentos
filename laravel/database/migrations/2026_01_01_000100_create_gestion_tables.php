<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('carretes', function (Blueprint $tabla) {
            $tabla->id();
            $tabla->string('marca', 60)->nullable();
            $tabla->string('material', 20)->default('PLA');
            $tabla->string('color_nombre', 40)->nullable();
            $tabla->string('color_hex', 7)->default('#cccccc');
            $tabla->decimal('peso_inicial', 10, 2);
            $tabla->decimal('peso_restante', 10, 2);
            $tabla->decimal('tara', 10, 2)->default(0);
            $tabla->decimal('costo', 12, 2)->default(0);
            $tabla->string('ubicacion', 40)->nullable();
            $tabla->text('notas')->nullable();
            $tabla->boolean('archivado')->default(false);
            $tabla->timestamps();

            $tabla->index('archivado');
        });

        Schema::create('impresiones', function (Blueprint $tabla) {
            $tabla->id();
            $tabla->string('nombre', 120);
            $tabla->date('fecha');
            $tabla->text('notas')->nullable();
            $tabla->string('imagen', 120)->nullable();
            $tabla->decimal('total_gramos', 10, 2)->default(0);
            $tabla->decimal('costo_total', 12, 2)->default(0);
            $tabla->boolean('revertida')->default(false);
            $tabla->timestamps();

            $tabla->index(['revertida', 'fecha']);
        });

        Schema::create('impresion_lineas', function (Blueprint $tabla) {
            $tabla->id();
            $tabla->foreignId('impresion_id')->constrained('impresiones')->cascadeOnDelete();
            $tabla->foreignId('carrete_id')->constrained('carretes')->restrictOnDelete();
            $tabla->decimal('gramos', 10, 2);
            $tabla->string('color_hex', 7)->nullable();
            $tabla->string('etiqueta', 60)->nullable();
        });

        Schema::create('movimientos', function (Blueprint $tabla) {
            $tabla->id();
            $tabla->foreignId('carrete_id')->constrained('carretes')->cascadeOnDelete();
            $tabla->foreignId('impresion_id')->nullable()->constrained('impresiones')->nullOnDelete();
            // carga | consumo | devolucion | ajuste
            $tabla->string('tipo', 12);
            $tabla->decimal('gramos', 10, 2);   // negativo cuando sale material
            $tabla->decimal('saldo', 10, 2);    // cuánto quedó en el carrete después
            $tabla->string('motivo', 200)->nullable();
            $tabla->timestamps();

            $tabla->index(['carrete_id', 'created_at']);
        });

        Schema::create('configuraciones', function (Blueprint $tabla) {
            $tabla->id();
            $tabla->decimal('alerta_bajo', 10, 2)->default(150);
            $tabla->string('moneda', 5)->default('$');
            $tabla->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('movimientos');
        Schema::dropIfExists('impresion_lineas');
        Schema::dropIfExists('impresiones');
        Schema::dropIfExists('configuraciones');
        Schema::dropIfExists('carretes');
    }
};
