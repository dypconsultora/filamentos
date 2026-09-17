<?php

namespace App\Services;

use App\Models\Carrete;
use App\Models\Configuracion;
use App\Models\Impresion;
use App\Models\Movimiento;

/**
 * Reglas de stock del filamento. Concentra acá el armado del estado que
 * consume el front y el registro de movimientos, para que los controladores
 * queden finos.
 */
class GestorStock
{
    public const LIMITE_IMPRESIONES = 200;
    public const LIMITE_MOVIMIENTOS = 300;

    /** Payload completo que espera el front-end en cada respuesta. */
    public function estado(): array
    {
        $carretes = Carrete::orderBy('id')->get();
        $impresiones = Impresion::with('lineas')
            ->orderByDesc('created_at')->orderByDesc('id')
            ->limit(self::LIMITE_IMPRESIONES)->get();
        $movimientos = Movimiento::orderByDesc('created_at')->orderByDesc('id')
            ->limit(self::LIMITE_MOVIMIENTOS)->get();

        return [
            'carretes' => $carretes->map->aJson()->all(),
            'impresiones' => $impresiones->map->aJson()->all(),
            'movimientos' => $movimientos->map->aJson()->all(),
            'config' => Configuracion::actual()->aJson(),
            'resumen' => $this->resumen($carretes),
        ];
    }

    private function resumen($carretes): array
    {
        $activos = $carretes->where('archivado', false);
        $restante = (float) $activos->sum('peso_restante');
        $inicial = (float) $activos->sum('peso_inicial');
        $alerta = Configuracion::actual()->alerta_bajo;

        $impresiones = Impresion::where('revertida', false);

        return [
            'carretes' => $activos->count(),
            'gramosRestantes' => round($restante, 2),
            'gramosIniciales' => round($inicial, 2),
            'gramosConsumidos' => round($inicial - $restante, 2),
            'bajos' => $activos->where('peso_restante', '<=', $alerta)->count(),
            'impresiones' => (clone $impresiones)->count(),
            'costoImpreso' => round((float) (clone $impresiones)->sum('costo_total'), 2),
        ];
    }

    /** Deja asentado el movimiento y actualiza el saldo del carrete. */
    public function registrarMovimiento(
        Carrete $carrete,
        string $tipo,
        float $gramos,
        string $motivo = '',
        ?int $impresionId = null
    ): void {
        Movimiento::create([
            'carrete_id' => $carrete->id,
            'impresion_id' => $impresionId,
            'tipo' => $tipo,
            'gramos' => round($gramos, 2),
            'saldo' => round($carrete->peso_restante, 2),
            'motivo' => mb_substr($motivo, 0, 200),
        ]);
    }

    /** Normaliza los números que llegan del formulario ("1,5" -> 1.5). */
    public static function numero($valor, float $porDefecto = 0): float
    {
        if ($valor === null || $valor === '') {
            return $porDefecto;
        }
        $limpio = str_replace(',', '.', (string) $valor);
        return is_numeric($limpio) ? (float) $limpio : $porDefecto;
    }

    public static function colorValido($hex, string $porDefecto = '#cccccc'): string
    {
        return is_string($hex) && preg_match('/^#[0-9a-fA-F]{6}$/', $hex)
            ? strtolower($hex)
            : $porDefecto;
    }
}
