<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Carrete extends Model
{
    protected $table = 'carretes';

    protected $fillable = [
        'marca', 'material', 'color_nombre', 'color_hex',
        'peso_inicial', 'peso_restante', 'tara', 'costo',
        'ubicacion', 'notas', 'archivado',
    ];

    protected $casts = [
        'peso_inicial' => 'float',
        'peso_restante' => 'float',
        'tara' => 'float',
        'costo' => 'float',
        'archivado' => 'boolean',
    ];

    /** Nombre legible, igual al que arma el front. */
    public function getNombreCompletoAttribute(): string
    {
        $partes = array_filter([$this->marca, $this->material, $this->color_nombre]);
        return $partes ? implode(' · ', $partes) : 'Carrete sin nombre';
    }

    /** Cuánto cuesta un gramo de este carrete (0 si no se cargó el costo). */
    public function costoPorGramo(): float
    {
        return $this->costo > 0 && $this->peso_inicial > 0
            ? $this->costo / $this->peso_inicial
            : 0.0;
    }

    /** Estructura que consume el front-end. */
    public function aJson(): array
    {
        return [
            'id' => (string) $this->id,
            'marca' => (string) $this->marca,
            'material' => (string) $this->material,
            'colorNombre' => (string) $this->color_nombre,
            'colorHex' => $this->color_hex,
            'pesoInicial' => round($this->peso_inicial, 2),
            'pesoRestante' => round($this->peso_restante, 2),
            'tara' => round($this->tara, 2),
            'costo' => round($this->costo, 2),
            'ubicacion' => (string) $this->ubicacion,
            'notas' => (string) $this->notas,
            'archivado' => $this->archivado,
            'creado' => optional($this->created_at)->toIso8601String(),
        ];
    }
}
