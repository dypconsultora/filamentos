<?php

namespace App\Http\Controllers;

use App\Models\Carrete;
use App\Models\Impresion;
use App\Models\ImpresionLinea;
use App\Services\GestorStock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ImpresionController extends Controller
{
    private const CARPETA = 'capturas';

    public function __construct(private GestorStock $stock) {}

    public function registrar(Request $peticion)
    {
        $lineas = $this->lineasNormalizadas($peticion->input('lineas'));
        if ($lineas instanceof \Illuminate\Http\JsonResponse) {
            return $lineas;
        }

        // lo que necesita cada carrete, sumando filas repetidas del mismo color
        $necesita = [];
        foreach ($lineas as $l) {
            $necesita[$l['carrete_id']] = ($necesita[$l['carrete_id']] ?? 0) + $l['gramos'];
        }

        $forzar = filter_var($peticion->input('forzar', false), FILTER_VALIDATE_BOOLEAN);
        $imagen = $this->guardarImagen($peticion->input('imagen'));

        try {
            $impresion = DB::transaction(function () use ($peticion, $lineas, $necesita, $forzar, $imagen) {
                // se bloquean los carretes para que dos descuentos simultáneos no se pisen
                $carretes = Carrete::whereIn('id', array_keys($necesita))
                    ->lockForUpdate()->get()->keyBy('id');

                if (! $forzar) {
                    $faltantes = [];
                    foreach ($necesita as $id => $gramos) {
                        $c = $carretes[$id];
                        if ($gramos > $c->peso_restante + 0.001) {
                            $faltantes[] = trim($c->marca.' '.$c->color_nombre)
                                .' (necesita '.round($gramos, 2).' g, quedan '.round($c->peso_restante, 2).' g)';
                        }
                    }
                    if ($faltantes) {
                        throw new SinStockSuficiente(implode('; ', $faltantes));
                    }
                }

                $impresion = Impresion::create([
                    'nombre' => mb_substr(trim((string) $peticion->input('nombre')), 0, 120) ?: 'Impresión sin nombre',
                    'fecha' => $this->fechaValida($peticion->input('fecha')),
                    'notas' => mb_substr(trim((string) $peticion->input('notas')), 0, 500),
                    'imagen' => $imagen,
                    'total_gramos' => round(array_sum(array_column($lineas, 'gramos')), 2),
                    'costo_total' => 0,
                ]);

                $costo = 0.0;
                foreach ($lineas as $l) {
                    $carrete = $carretes[$l['carrete_id']];

                    ImpresionLinea::create([
                        'impresion_id' => $impresion->id,
                        'carrete_id' => $carrete->id,
                        'gramos' => $l['gramos'],
                        'color_hex' => $l['color_hex'] ?: $carrete->color_hex,
                        'etiqueta' => $l['etiqueta'],
                    ]);

                    $carrete->peso_restante = round(max(0, $carrete->peso_restante - $l['gramos']), 2);
                    $carrete->save();

                    $costo += $carrete->costoPorGramo() * $l['gramos'];
                    $this->stock->registrarMovimiento(
                        $carrete, 'consumo', -$l['gramos'], $impresion->nombre, $impresion->id
                    );
                }

                $impresion->costo_total = round($costo, 2);
                $impresion->save();

                return $impresion;
            });
        } catch (SinStockSuficiente $e) {
            $this->borrarImagen($imagen);

            return response()->json([
                'error' => 'No alcanza el filamento en: '.$e->getMessage(),
                'requiereConfirmacion' => true,
            ], 409);
        }

        return response()->json(
            $this->stock->estado() + ['impresion' => $impresion->load('lineas')->aJson()]
        );
    }

    /** Devuelve los gramos al carrete. La impresión queda marcada, no se borra. */
    public function revertir(Impresion $impresion)
    {
        if ($impresion->revertida) {
            return response()->json(['error' => 'Esa impresión ya fue revertida.'], 400);
        }

        DB::transaction(function () use ($impresion) {
            foreach ($impresion->lineas as $linea) {
                $carrete = Carrete::lockForUpdate()->find($linea->carrete_id);
                if (! $carrete) {
                    continue;
                }
                $carrete->peso_restante = round(
                    min($carrete->peso_inicial, $carrete->peso_restante + $linea->gramos), 2
                );
                $carrete->save();

                $this->stock->registrarMovimiento(
                    $carrete, 'devolucion', $linea->gramos,
                    'Reversión: '.$impresion->nombre, $impresion->id
                );
            }

            $impresion->revertida = true;
            $impresion->save();
        });

        return response()->json($this->stock->estado());
    }

    public function borrar(Impresion $impresion)
    {
        if (! $impresion->revertida) {
            return response()->json(['error' => 'Revertí la impresión antes de borrarla.'], 400);
        }

        $this->borrarImagen($impresion->imagen);
        $impresion->delete();

        return response()->json($this->stock->estado());
    }

    /** Las capturas no son públicas: se sirven solo con la sesión iniciada. */
    public function captura(string $archivo)
    {
        $archivo = basename($archivo);
        $ruta = self::CARPETA.'/'.$archivo;

        abort_unless(Storage::disk('local')->exists($ruta), 404);

        return response()->file(Storage::disk('local')->path($ruta));
    }

    /* ------------------------------------------------------------------ */

    private function lineasNormalizadas($entrada)
    {
        $lineas = [];
        foreach (is_array($entrada) ? $entrada : [] as $l) {
            $gramos = round(GestorStock::numero($l['gramos'] ?? 0), 2);
            if ($gramos <= 0) {
                continue;
            }
            if (empty($l['carreteId']) || ! Carrete::whereKey($l['carreteId'])->exists()) {
                return response()->json(['error' => 'Hay una fila sin carrete asignado.'], 400);
            }
            $lineas[] = [
                'carrete_id' => (int) $l['carreteId'],
                'gramos' => $gramos,
                'color_hex' => GestorStock::colorValido($l['colorHex'] ?? null, ''),
                'etiqueta' => mb_substr(trim((string) ($l['etiqueta'] ?? '')), 0, 60),
            ];
        }

        if (! $lineas) {
            return response()->json(['error' => 'Cargá al menos un consumo con gramos.'], 400);
        }

        return $lineas;
    }

    private function fechaValida($valor): string
    {
        try {
            return $valor ? \Carbon\Carbon::parse($valor)->format('Y-m-d') : now()->format('Y-m-d');
        } catch (\Throwable) {
            return now()->format('Y-m-d');
        }
    }

    /** La captura llega como data URL desde el navegador. */
    private function guardarImagen($dato): ?string
    {
        if (! is_string($dato) || ! preg_match('#^data:image/(png|jpe?g|webp);base64,(.+)$#s', $dato, $m)) {
            return null;
        }

        $binario = base64_decode($m[2], true);
        if ($binario === false || strlen($binario) > 8 * 1024 * 1024) {
            return null;
        }

        $extension = $m[1] === 'jpeg' ? 'jpg' : $m[1];
        $nombre = now()->format('Ymd-His').'-'.Str::random(8).'.'.$extension;
        Storage::disk('local')->put(self::CARPETA.'/'.$nombre, $binario);

        return $nombre;
    }

    private function borrarImagen(?string $nombre): void
    {
        if ($nombre) {
            Storage::disk('local')->delete(self::CARPETA.'/'.basename($nombre));
        }
    }
}

/** Se usa para abortar la transacción cuando el filamento no alcanza. */
class SinStockSuficiente extends \RuntimeException {}
