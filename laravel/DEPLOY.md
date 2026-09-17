# Puesta en producción (hosting compartido con cPanel)

Guía para instalar el gestor en un plan de hosting común con PHP y MySQL/MariaDB.

## 1. Lo que tiene que tener el hosting

| Requisito | Detalle |
|---|---|
| PHP | **8.2 o superior** (se selecciona desde cPanel → *MultiPHP Manager*) |
| Extensiones PHP | `pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `json`, `fileinfo`, `bcmath` — casi todas vienen activas |
| Base de datos | MySQL 5.7+ o MariaDB 10.3+ |
| Espacio | ~100 MB de código, más lo que ocupen las capturas |
| Acceso | Terminal SSH o el *Terminal* de cPanel. Sin eso, ver el punto 7 |

## 2. Preparar los archivos antes de subir

En la máquina de desarrollo:

```bash
cd laravel
./sincronizar-ui.sh
composer install --no-dev --optimize-autoloader
```

`sincronizar-ui.sh` copia la interfaz desde la carpeta `public/` del repositorio.
**Hay que correrlo siempre que se toque la interfaz**, o se sube una versión vieja.

`composer install --no-dev` deja la carpeta `vendor/` lista, así no hace falta
tener Composer en el servidor.

## 3. Base de datos

En cPanel → *MySQL Databases*:

1. Crear la base (queda con prefijo, por ejemplo `micuenta_filamento`).
2. Crear un usuario con una contraseña larga.
3. Asignar el usuario a la base con **todos los privilegios**.

Anotar los tres datos: nombre de base, usuario y contraseña.

## 4. Subir los archivos

La carpeta `public/` de Laravel es la única que debe quedar expuesta en la web.
El resto del código tiene que quedar **fuera** de `public_html`.

**Opción A — la recomendada (dominio o subdominio propio):**
En cPanel → *Domains*, apuntar la raíz del documento del dominio a
`/home/USUARIO/gestion-filamento/public`. Se sube todo el proyecto a
`/home/USUARIO/gestion-filamento/` y listo, no hay que tocar nada más.

**Opción B — si el panel no deja cambiar la raíz:**
1. Subir todo el proyecto a `/home/USUARIO/gestion-filamento/`.
2. Copiar el contenido de `gestion-filamento/public/` dentro de `public_html/`.
3. Editar `public_html/index.php` y corregir las dos rutas:

```php
require __DIR__.'/../gestion-filamento/vendor/autoload.php';
$app = require_once __DIR__.'/../gestion-filamento/bootstrap/app.php';
```

## 5. Configurar el entorno

Copiar `.env.example` a `.env` y completar:

```
APP_NAME="Gestor de Filamento"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://filamento.midominio.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=micuenta_filamento
DB_USERNAME=micuenta_filausr
DB_PASSWORD=la-contraseña-de-la-base

SESSION_DRIVER=database
CACHE_STORE=file
QUEUE_CONNECTION=sync
```

> `APP_DEBUG=false` es obligatorio en producción: en `true`, un error muestra
> rutas del servidor y datos de la base en pantalla.

## 6. Instalar (por consola)

```bash
cd ~/gestion-filamento
php artisan key:generate --force
php artisan migrate --force
php artisan filamento:usuario admin --nombre="Administrador" --clave="UNA-CLAVE-LARGA"
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Permisos de escritura:

```bash
chmod -R 775 storage bootstrap/cache
```

## 7. Si el hosting no tiene consola

cPanel → *Cron Jobs* permite correr un comando una sola vez. Se programa para
dentro de dos minutos, se deja correr y después se borra:

```
cd /home/USUARIO/gestion-filamento && /usr/local/bin/php artisan migrate --force && /usr/local/bin/php artisan filamento:usuario admin --clave="UNA-CLAVE-LARGA"
```

(La ruta exacta de PHP aparece en cPanel → *MultiPHP Manager*.)

## 8. Verificar

1. Abrir la URL: tiene que aparecer la pantalla de acceso.
2. Entrar con el usuario creado.
3. Cargar un carrete de prueba y registrar una impresión con una captura.
4. Comprobar que la captura se vea en el historial.
5. Abrir la dirección de una captura **en una ventana privada**: tiene que pedir
   sesión y no mostrar la imagen.
6. Probar que `https://eldominio/.env` dé error 404. Si muestra el archivo, la
   raíz del documento está mal configurada — volver al punto 4.

## 9. Backups

Configurar en cPanel el backup automático de:

- La base de datos (es donde vive todo el stock y el histórico).
- La carpeta `storage/app/private/capturas` (las capturas del laminador).

## 10. Actualizaciones

```bash
cd laravel && ./sincronizar-ui.sh          # en desarrollo
# subir los archivos cambiados, y en el servidor:
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan view:cache
```

Si algo queda raro después de actualizar, limpiar las cachés:

```bash
php artisan optimize:clear
```
