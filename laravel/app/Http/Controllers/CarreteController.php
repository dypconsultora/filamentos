<?php

namespace App\Http\Controllers;

use App\Models\Carrete;
use App\Models\Configuracion;
use App\Services\GestorStock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CarreteController extends Controller
{
    public function __construct(private GestorStock $stock) {}

    public function estado()
    {
        return response()->json($this->stock->estado());
    }

    public function guardarConfig(Request $peticion)
    {
        $config = Configuracion::actual();
        if ($peticion->has('alertaBajo')) {
            $config->alerta_bajo = max(0, GestorStock::numero($peticion->input('alertaBajo'), 150));
        }
        if ($peticion->has('moneda')) {
            $config->moneda = mb_substr(trim((string) $peticion->input('moneda')), 0, 5) ?: '$';
        }
        $config->save();

        return response()->json($this->stock->estado());
    }

    public function crear(Request $peticion)
    {
        $datos = $this->camposComunes($peticion);

        if ($datos['marca'] === '' && $datos['color_nombre'] === '') {
            return response()->json(['error' => 'Indicá al menos la marca o el nombre del color.'], 400);
        }
        if ($datos['peso_inicial'] <= 0) {
            return response()->json(['error' => 'El peso neto del carrete debe ser mayor a 0.'], 400);
        }

        $restante = $peticion->input('pesoRestante');
        $datos['peso_restante'] = ($restante === null || $restante === '')
            ? $datos['peso_inicial']
            : min($datos['peso_inicial'], max(0, GestorStock::numero($restante)));

        $carrete = DB::transaction(function () use ($datos) {
            $carrete = Carrete::create($datos);
            $this->stock->registrarMovimiento($carrete, 'carga', $carrete->peso_restante, 'Alta del carrete');
            return $carrete;
        });

        return response()->json($this->stock->estado());
    }

    public function actualizar(Request $peticion, Carrete $carrete)
    {
        $datos = $this->camposComunes($peticion, $carrete);
        unset($datos['peso_restante']);

        $carrete->fill($datos);
        if ($carrete->peso_restante > $carrete->peso_inicial) {
            $carrete->peso_restante = $carrete->peso_inicial;
        }
        $carrete->save();

        return response()->json($this->stock->estado());
    }

    /** Corrige los gramos disponibles, por ejemplo después de pesar el carrete. */
    public function ajustar(Request $peticion, Carrete $carrete)
    {
        DB::transaction(function () use ($peticion, $carrete) {
            $carrete = Carrete::lockForUpdate()->find($carrete->id);
            $nuevo = max(0, min(
                $carrete->peso_inicial,
                GestorStock::numero($peticion->input('pesoRestante'), $carrete->peso_restante)
            ));
            $delta = $nuevo - $carrete->peso_restante;
            $carrete->peso_restante = round($nuevo, 2);
            $carrete->save();

            $motivo = trim((string) $peticion->input('motivo')) ?: 'Ajuste manual de stock';
            $this->stock->registrarMovimiento($carrete, 'ajuste', $delta, $motivo);
        });

        return response()->json($this->stock->estado());
    }

    /** Entró un carrete nuevo del mismo color: vuelve a lleno. */
    public function recargar(Request $peticion, Carrete $carrete)
    {
        DB::transaction(function () use ($peticion, $carrete) {
            $carrete = Carrete::lockForUpdate()->find($carrete->id);
            $gramos = max(0, GestorStock::numero($peticion->input('gramos'), $carrete->peso_inicial));
            $carrete->peso_inicial = round($gramos, 2);
            $carrete->peso_restante = round($gramos, 2);
            $carrete->save();

            $this->stock->registrarMovimiento($carrete, 'carga', $gramos, 'Carrete nuevo / repuesto');
        });

        return response()->json($this->stock->estado());
    }

    /** No se borra: se archiva, para no perder el histórico de consumos. */
    public function archivar(Carrete $carrete)
    {
        $carrete->archivado = ! $carrete->archivado;
        $carrete->save();

        return response()->json($this->stock->estado());
    }

    private function camposComunes(Request $peticion, ?Carrete $base = null): array
    {
        $texto = fn ($campo, $def, $largo) => mb_substr(
            trim((string) $peticion->input($campo, $def)), 0, $largo
        );

        return [
            'marca' => $texto('marca', $base->marca ?? '', 60),
            'material' => $texto('material', $base->material ?? 'PLA', 20),
            'color_nombre' => $texto('colorNombre', $base->color_nombre ?? '', 40),
            'color_hex' => GestorStock::colorValido(
                $peticion->input('colorHex'), $base->color_hex ?? '#cccccc'
            ),
            'peso_inicial' => max(0, GestorStock::numero(
                $peticion->input('pesoInicial'), $base->peso_inicial ?? 1000
            )),
            'tara' => max(0, GestorStock::numero($peticion->input('tara'), $base->tara ?? 0)),
            'costo' => max(0, GestorStock::numero($peticion->input('costo'), $base->costo ?? 0)),
            'ubicacion' => $texto('ubicacion', $base->ubicacion ?? '', 40),
            'notas' => $texto('notas', $base->notas ?? '', 500),
        ];
    }
}
