<?php

use App\Http\Controllers\AccesoController;
use App\Http\Controllers\CarreteController;
use App\Http\Controllers\ImpresionController;
use Illuminate\Support\Facades\Route;

/*
 * La interfaz es una sola página; todo lo demás son llamadas JSON.
 * Las rutas viven en web.php a propósito: usan sesión por cookie y CSRF.
 */

Route::view('/', 'app')->name('inicio');

Route::prefix('api')->group(function () {
    Route::post('login', [AccesoController::class, 'entrar']);
    Route::get('me', [AccesoController::class, 'yo']);

    Route::middleware('auth')->group(function () {
        Route::post('logout', [AccesoController::class, 'salir']);
        Route::post('clave', [AccesoController::class, 'cambiarClave']);

        Route::get('estado', [CarreteController::class, 'estado']);
        Route::post('config', [CarreteController::class, 'guardarConfig']);

        Route::post('carretes', [CarreteController::class, 'crear']);
        Route::put('carretes/{carrete}', [CarreteController::class, 'actualizar']);
        Route::post('carretes/{carrete}/ajuste', [CarreteController::class, 'ajustar']);
        Route::post('carretes/{carrete}/recargar', [CarreteController::class, 'recargar']);
        Route::delete('carretes/{carrete}', [CarreteController::class, 'archivar']);

        Route::post('impresiones', [ImpresionController::class, 'registrar']);
        Route::post('impresiones/{impresion}/revertir', [ImpresionController::class, 'revertir']);
        Route::delete('impresiones/{impresion}', [ImpresionController::class, 'borrar']);
    });
});

// Las capturas del laminador solo se sirven con la sesión iniciada.
Route::get('uploads/{archivo}', [ImpresionController::class, 'captura'])
    ->middleware('auth')->where('archivo', '[A-Za-z0-9\-\.]+');
