<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ImpresionLinea extends Model
{
    protected $table = 'impresion_lineas';
    public $timestamps = false;

    protected $fillable = ['impresion_id', 'carrete_id', 'gramos', 'color_hex', 'etiqueta'];

    protected $casts = ['gramos' => 'float'];
}
