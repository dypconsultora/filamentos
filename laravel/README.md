# Gestor de Filamento 3D — versión Laravel

Versión de producción: PHP (Laravel 12) con MySQL/MariaDB, pensada para correr
en hosting compartido.

## Cómo está armado

La **interfaz es la misma** que la del resto del proyecto: vive en la carpeta
`public/` del repositorio y se comparte entre las tres versiones (la de Node,
la estática de GitHub Pages y esta). Acá solo cambia lo que hay detrás.

```
laravel/
├── app/
│   ├── Console/Commands/GestionarUsuario.php   alta y cambio de clave por consola
│   ├── Http/Controllers/
│   │   ├── AccesoController.php                entrar, salir, cambiar contraseña
│   │   ├── CarreteController.php               carretes, ajustes y configuración
│   │   └── ImpresionController.php             descuento de stock y capturas
│   ├── Models/                                 Carrete, Impresion, Movimiento…
│   └── Services/GestorStock.php                reglas de stock y armado del estado
├── database/migrations/                        esquema de la base
├── public/assets/csrf.js                       puente entre la interfaz y Laravel
├── resources/views/app.blade.php               generado por sincronizar-ui.sh
├── routes/web.php                              la API
├── sincronizar-ui.sh                           copia la interfaz desde ../public
└── DEPLOY.md                                   instalación en cPanel
```

## Levantarlo en desarrollo

```bash
composer install
cp .env.example .env && php artisan key:generate
# completar los datos de la base en .env
php artisan migrate --seed
./sincronizar-ui.sh
php artisan serve
```

Queda en http://localhost:8000 con el usuario **admin** / **Filamento2026**
(solo para desarrollo; en producción la clave se define al instalar).

## Decisiones que conviene conocer

**No usa Vite ni npm.** No hay compilación de assets: la interfaz son dos
archivos estáticos que se copian tal cual. Esto simplifica mucho el deploy en
hosting compartido, donde no hay Node.

**La API va en `routes/web.php`, no en `api.php`.** Usa sesión por cookie y
protección CSRF, que es lo correcto para una aplicación que se usa desde el
navegador. El token se le inyecta a la interfaz desde `public/assets/csrf.js`,
para no tener que modificar el código compartido.

**Los descuentos de stock son transaccionales.** Se bloquean las filas de los
carretes involucrados (`lockForUpdate`) mientras se descuenta, así dos personas
registrando impresiones al mismo tiempo no se pisan los saldos.

**Las capturas no son públicas.** Se guardan fuera de `public/` y se sirven por
una ruta que exige sesión iniciada.

**Los carretes no se borran, se archivan.** Borrarlos rompería el histórico de
consumos y movimientos.

## Ver también

- `DEPLOY.md` — instalación en hosting compartido con cPanel.
- `../README.md` — las otras dos versiones y el funcionamiento general.
