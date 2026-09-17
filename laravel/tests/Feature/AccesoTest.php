<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccesoTest extends TestCase
{
    use RefreshDatabase;

    private function usuario(): User
    {
        return User::create([
            'nombre' => 'Administrador', 'usuario' => 'admin', 'password' => 'Filamento2026',
        ]);
    }

    public function test_entra_con_las_credenciales_correctas(): void
    {
        $this->usuario();

        $this->postJson('/api/login', ['usuario' => 'admin', 'clave' => 'Filamento2026'])
            ->assertOk()
            ->assertJsonPath('usuario.usuario', 'admin')
            ->assertJsonStructure(['csrf']);
    }

    public function test_el_usuario_no_distingue_mayusculas(): void
    {
        $this->usuario();

        $this->postJson('/api/login', ['usuario' => '  ADMIN ', 'clave' => 'Filamento2026'])->assertOk();
    }

    public function test_rechaza_la_clave_incorrecta(): void
    {
        $this->usuario();

        $this->postJson('/api/login', ['usuario' => 'admin', 'clave' => 'otra'])
            ->assertStatus(401)
            ->assertJsonStructure(['error']);
    }

    public function test_cambiar_la_clave_exige_la_anterior(): void
    {
        $usuario = $this->usuario();
        $this->actingAs($usuario);

        $this->postJson('/api/clave', ['actual' => 'incorrecta', 'nueva' => 'nuevaclave'])
            ->assertStatus(400);

        $this->postJson('/api/clave', ['actual' => 'Filamento2026', 'nueva' => 'nuevaclave'])
            ->assertOk();

        $this->postJson('/api/login', ['usuario' => 'admin', 'clave' => 'nuevaclave'])->assertOk();
    }

    public function test_la_clave_nueva_tiene_minimo(): void
    {
        $this->actingAs($this->usuario());

        $this->postJson('/api/clave', ['actual' => 'Filamento2026', 'nueva' => '123'])
            ->assertStatus(422)->assertJsonStructure(['error']);
    }
}
