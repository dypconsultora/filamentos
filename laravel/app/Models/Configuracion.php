<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Configuracion extends Model
{
    protected $table = 'configuraciones';

    protected $fillable = ['alerta_bajo', 'moneda'];

    protected $casts = ['alerta_bajo' => 'float'];

    /** Siempre hay una sola fila de configuración. */
    public static function actual(): self
    {
        return static::firstOrCreate([], ['alerta_bajo' => 150, 'moneda' => '$']);
    }

    public function aJson(): array
    {
        return ['alertaBajo' => round($this->alerta_bajo, 2), 'moneda' => $this->moneda];
    }
}
