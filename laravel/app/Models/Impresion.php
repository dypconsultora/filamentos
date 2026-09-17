<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Impresion extends Model
{
    protected $table = 'impresiones';

    protected $fillable = [
        'nombre', 'fecha', 'notas', 'imagen',
        'total_gramos', 'costo_total', 'revertida',
    ];

    protected $casts = [
        'fecha' => 'date',
        'total_gramos' => 'float',
        'costo_total' => 'float',
        'revertida' => 'boolean',
    ];

    public function lineas(): HasMany
    {
        return $this->hasMany(ImpresionLinea::class, 'impresion_id');
    }

    public function aJson(): array
    {
        return [
            'id' => (string) $this->id,
            'nombre' => $this->nombre,
            'fecha' => optional($this->fecha)->format('Y-m-d'),
            'notas' => (string) $this->notas,
            'imagen' => $this->imagen,
            'lineas' => $this->lineas->map(fn ($l) => [
                'carreteId' => (string) $l->carrete_id,
                'gramos' => round($l->gramos, 2),
                'colorHex' => $l->color_hex,
                'etiqueta' => (string) $l->etiqueta,
            ])->all(),
            'totalGramos' => round($this->total_gramos, 2),
            'costoTotal' => round($this->costo_total, 2),
            'revertida' => $this->revertida,
            'creado' => optional($this->created_at)->toIso8601String(),
        ];
    }
}
