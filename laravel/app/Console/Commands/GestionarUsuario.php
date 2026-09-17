<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/**
 * Alta y cambio de contraseña desde la consola, para cuando no se puede
 * entrar a la aplicación (por ejemplo al instalarla en el hosting).
 */
class GestionarUsuario extends Command
{
    protected $signature = 'filamento:usuario
                            {usuario : nombre de usuario para entrar}
                            {--clave= : contraseña (si se omite, se pide por pantalla)}
                            {--nombre= : nombre a mostrar}';

    protected $description = 'Crea el usuario o le cambia la contraseña';

    public function handle(): int
    {
        $usuario = mb_strtolower(trim($this->argument('usuario')));
        $clave = $this->option('clave') ?: $this->secret('Contraseña nueva');

        if (mb_strlen((string) $clave) < 6) {
            $this->error('La contraseña debe tener al menos 6 caracteres.');
            return self::FAILURE;
        }

        $modelo = User::firstOrNew(['usuario' => $usuario]);
        $nuevo = ! $modelo->exists;
        $modelo->nombre = $this->option('nombre') ?: ($modelo->nombre ?: 'Administrador');
        $modelo->password = $clave;
        $modelo->save();

        $this->info($nuevo
            ? "Usuario «{$usuario}» creado."
            : "Contraseña de «{$usuario}» actualizada.");

        return self::SUCCESS;
    }
}
