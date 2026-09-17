<?php

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // No hay pantalla de login aparte (la app es una sola página): al visitante
        // sin sesión se lo manda a la raíz, salvo en las rutas que responden JSON.
        $middleware->redirectGuestsTo(
            fn ($peticion) => $peticion->is('api/*') || $peticion->is('uploads/*') ? null : '/'
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // El front espera siempre {"error": "..."} en las respuestas fallidas.
        $exceptions->render(function (ValidationException $e, $peticion) {
            if ($peticion->is('api/*')) {
                return response()->json(['error' => $e->validator->errors()->first()], 422);
            }
        });

        $exceptions->render(function (AuthenticationException $e, $peticion) {
            // no hay pantalla de login aparte: la app es una sola página
            if ($peticion->is('api/*') || $peticion->is('uploads/*')) {
                return response()->json(['error' => 'Necesitás iniciar sesión.'], 401);
            }

            return redirect('/');
        });

        $exceptions->render(function (TokenMismatchException $e, $peticion) {
            if ($peticion->is('api/*')) {
                return response()->json([
                    'error' => 'La sesión venció. Recargá la página y volvé a entrar.',
                ], 419);
            }
        });
    })->create();
