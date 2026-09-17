<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Movimiento extends Model
{
    protected $table = 'movimientos';

    protected $fillable = ['carrete_id', 'impresion_id', 'tipo', 'gramos', 'saldo', 'motivo'];

    protected $casts = ['gramos' => 'float', 'saldo' => 'float'];

    public function aJson(): array
    {
        return [
            'id' => (string) $this->id,
            'carreteId' => (string) $this->carrete_id,
            'tipo' => $this->tipo,
            'gramos' => round($this->gramos, 2),
            'saldo' => round($this->saldo, 2),
            'motivo' => (string) $this->motivo,
            'ref' => $this->impresion_id ? (string) $this->impresion_id : null,
            'fecha' => optional($this->created_at)->toIso8601String(),
        ];
    }
}
