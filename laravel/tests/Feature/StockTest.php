<?php

namespace Tests\Feature;

use App\Models\Carrete;
use App\Models\Impresion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Las reglas de stock son el corazón del sistema: si descuentan mal,
 * el cliente pierde el control del filamento.
 */
class StockTest extends TestCase
{
    use RefreshDatabase;

    private function ingresar(): User
    {
        $usuario = User::create([
            'nombre' => 'Tester', 'usuario' => 'tester', 'password' => 'secreto123',
        ]);
        $this->actingAs($usuario);

        return $usuario;
    }

    private function carrete(array $extra = []): Carrete
    {
        return Carrete::create(array_merge([
            'marca' => 'Bambu Lab', 'material' => 'PLA', 'color_nombre' => 'Blanco',
            'color_hex' => '#ffffff', 'peso_inicial' => 1000, 'peso_restante' => 1000,
            'tara' => 200, 'costo' => 28000,
        ], $extra));
    }

    public function test_sin_sesion_no_se_puede_ver_el_estado(): void
    {
        $this->getJson('/api/estado')->assertStatus(401);
    }

    public function test_descuenta_los_gramos_de_cada_carrete(): void
    {
        $this->ingresar();
        $blanco = $this->carrete();
        $azul = $this->carrete(['color_nombre' => 'Azul', 'color_hex' => '#2050a8', 'costo' => 22000]);

        $respuesta = $this->postJson('/api/impresiones', [
            'nombre' => 'Llaveros',
            'lineas' => [
                ['carreteId' => (string) $blanco->id, 'gramos' => 27.44],
                ['carreteId' => (string) $azul->id, 'gramos' => 8.96],
            ],
        ])->assertOk();

        $this->assertEquals(972.56, $blanco->fresh()->peso_restante);
        $this->assertEquals(991.04, $azul->fresh()->peso_restante);
        $this->assertEquals(36.40, $respuesta->json('impresion.totalGramos'));
        // 28000/1000*27,44 + 22000/1000*8,96
        $this->assertEquals(965.44, $respuesta->json('impresion.costoTotal'));
    }

    public function test_suma_varias_filas_del_mismo_carrete(): void
    {
        $this->ingresar();
        $carrete = $this->carrete(['peso_restante' => 30]);

        $this->postJson('/api/impresiones', [
            'nombre' => 'Dos piezas del mismo color',
            'lineas' => [
                ['carreteId' => (string) $carrete->id, 'gramos' => 20],
                ['carreteId' => (string) $carrete->id, 'gramos' => 20],
            ],
        ])->assertStatus(409)->assertJson(['requiereConfirmacion' => true]);

        $this->assertEquals(30, $carrete->fresh()->peso_restante);
    }

    public function test_avisa_cuando_no_alcanza_y_no_toca_el_stock(): void
    {
        $this->ingresar();
        $carrete = $this->carrete(['peso_restante' => 12]);

        $this->postJson('/api/impresiones', [
            'nombre' => 'Pieza grande',
            'lineas' => [['carreteId' => (string) $carrete->id, 'gramos' => 27.44]],
        ])->assertStatus(409)->assertJson(['requiereConfirmacion' => true]);

        $this->assertEquals(12, $carrete->fresh()->peso_restante);
        $this->assertSame(0, Impresion::count());
    }

    public function test_forzando_el_descuento_el_carrete_queda_en_cero_nunca_negativo(): void
    {
        $this->ingresar();
        $carrete = $this->carrete(['peso_restante' => 12]);

        $this->postJson('/api/impresiones', [
            'nombre' => 'Pieza grande',
            'forzar' => true,
            'lineas' => [['carreteId' => (string) $carrete->id, 'gramos' => 27.44]],
        ])->assertOk();

        $this->assertEquals(0, $carrete->fresh()->peso_restante);
    }

    public function test_revertir_devuelve_los_gramos_exactos(): void
    {
        $this->ingresar();
        $carrete = $this->carrete();

        $this->postJson('/api/impresiones', [
            'nombre' => 'Mal cargada',
            'lineas' => [['carreteId' => (string) $carrete->id, 'gramos' => 27.44]],
        ])->assertOk();
        $this->assertEquals(972.56, $carrete->fresh()->peso_restante);

        $impresion = Impresion::first();
        $this->postJson("/api/impresiones/{$impresion->id}/revertir")->assertOk();

        $this->assertEquals(1000, $carrete->fresh()->peso_restante);
        $this->assertTrue($impresion->fresh()->revertida);

        // revertir dos veces no puede duplicar la devolución
        $this->postJson("/api/impresiones/{$impresion->id}/revertir")->assertStatus(400);
        $this->assertEquals(1000, $carrete->fresh()->peso_restante);
    }

    public function test_la_reversion_no_supera_el_peso_inicial(): void
    {
        $this->ingresar();
        $carrete = $this->carrete();

        $this->postJson('/api/impresiones', [
            'nombre' => 'Consumo',
            'lineas' => [['carreteId' => (string) $carrete->id, 'gramos' => 100]],
        ])->assertOk();

        // entra un carrete nuevo antes de revertir
        $this->postJson("/api/carretes/{$carrete->id}/recargar", ['gramos' => 1000])->assertOk();

        $impresion = Impresion::first();
        $this->postJson("/api/impresiones/{$impresion->id}/revertir")->assertOk();

        $this->assertEquals(1000, $carrete->fresh()->peso_restante);
    }

    public function test_una_impresion_sin_gramos_es_rechazada(): void
    {
        $this->ingresar();
        $carrete = $this->carrete();

        $this->postJson('/api/impresiones', [
            'nombre' => 'Vacía',
            'lineas' => [['carreteId' => (string) $carrete->id, 'gramos' => 0]],
        ])->assertStatus(400);
    }

    public function test_el_ajuste_manual_queda_asentado_en_los_movimientos(): void
    {
        $this->ingresar();
        $carrete = $this->carrete();

        $this->postJson("/api/carretes/{$carrete->id}/ajuste", [
            'pesoRestante' => 440, 'motivo' => 'Pesado en balanza',
        ])->assertOk();

        $this->assertEquals(440, $carrete->fresh()->peso_restante);
        $this->assertDatabaseHas('movimientos', [
            'carrete_id' => $carrete->id, 'tipo' => 'ajuste', 'gramos' => -560, 'saldo' => 440,
        ]);
    }

    public function test_el_ajuste_no_puede_superar_el_peso_inicial(): void
    {
        $this->ingresar();
        $carrete = $this->carrete(['peso_restante' => 500]);

        $this->postJson("/api/carretes/{$carrete->id}/ajuste", ['pesoRestante' => 5000])->assertOk();

        $this->assertEquals(1000, $carrete->fresh()->peso_restante);
    }

    public function test_los_ids_se_devuelven_como_texto(): void
    {
        $this->ingresar();
        $this->carrete();

        $this->getJson('/api/estado')->assertOk()
            ->assertJsonPath('carretes.0.id', fn ($id) => is_string($id));
    }
}
