<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class AccesoController extends Controller
{
    public function entrar(Request $peticion)
    {
        $datos = $peticion->validate([
            'usuario' => ['required', 'string', 'max:40'],
            'clave' => ['required', 'string'],
        ]);

        // freno a la fuerza bruta: 8 intentos por minuto por usuario + IP
        $llave = Str::lower($datos['usuario']).'|'.$peticion->ip();
        if (RateLimiter::tooManyAttempts($llave, 8)) {
            return response()->json([
                'error' => 'Demasiados intentos. Esperá '.RateLimiter::availableIn($llave).' segundos.',
            ], 429);
        }

        $credenciales = ['usuario' => Str::lower(trim($datos['usuario'])), 'password' => $datos['clave']];
        if (! Auth::attempt($credenciales, true)) {
            RateLimiter::hit($llave, 60);
            return response()->json(['error' => 'Usuario o contraseña incorrectos.'], 401);
        }

        RateLimiter::clear($llave);
        // regenerar la sesión cambia también el token CSRF: se devuelve el nuevo
        // para que el navegador siga pudiendo escribir (ver public/assets/csrf.js)
        $peticion->session()->regenerate();

        return response()->json([
            'usuario' => $this->usuarioJson(),
            'csrf' => csrf_token(),
        ]);
    }

    public function salir(Request $peticion)
    {
        Auth::logout();
        $peticion->session()->invalidate();
        $peticion->session()->regenerateToken();

        return response()->json(['ok' => true, 'csrf' => csrf_token()]);
    }

    public function yo()
    {
        if (! Auth::check()) {
            return response()->json(['error' => 'Sin sesión.'], 401);
        }

        return response()->json(['usuario' => $this->usuarioJson()]);
    }

    public function cambiarClave(Request $peticion)
    {
        $datos = $peticion->validate([
            'actual' => ['required', 'string'],
            'nueva' => ['required', 'string', 'min:6'],
        ], [], ['nueva' => 'nueva contraseña']);

        $usuario = Auth::user();
        if (! Hash::check($datos['actual'], $usuario->password)) {
            return response()->json(['error' => 'La contraseña actual no coincide.'], 400);
        }

        $usuario->password = $datos['nueva'];
        $usuario->save();

        return response()->json(['ok' => true]);
    }

    private function usuarioJson(): array
    {
        $u = Auth::user();

        return ['usuario' => $u->usuario, 'nombre' => $u->nombre];
    }
}
