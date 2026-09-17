# Gestor de Filamento 3D

Control de stock de filamento por carrete, con descuento automático a partir de la
captura del **Resultado del corte** de Bambu Studio.

## Dos formas de usarlo

### 1. Versión online (GitHub Pages) — para mostrar y probar

**https://dypconsultora.github.io/filamentos/**

Se abre en el navegador, sin instalar nada. Sirve para que lo vean y lo prueben.

> Ojo: al no haber servidor, **los datos se guardan solo en el navegador de cada
> persona**. No se comparten entre computadoras y se pierden si se borran los datos
> de navegación. El usuario y la contraseña son un simple candado de la pantalla,
> no protegen información. Para el trabajo diario, usar la versión con servidor.

### 2. Versión Laravel + MySQL — la de producción

Está en la carpeta `laravel/`. Es la que va al hosting: los datos viven en una
base MySQL/MariaDB en el servidor, así **todos ven el mismo stock** desde
cualquier computadora.

```bash
cd laravel && ./sincronizar-ui.sh && php artisan serve
```

Ver `laravel/README.md` para levantarla en desarrollo y `laravel/DEPLOY.md` para
instalarla en un hosting con cPanel.

### 3. Versión con servidor Node — la primera, para uso local

```bash
node server.js
```

Después abrir http://localhost:4173 (para cambiar el puerto: `PORT=5000 node server.js`).

No necesita `npm install`: funciona solo con Node.js, sin dependencias.
Los datos quedan en `data/db.json` y las capturas en `data/uploads/`, en la máquina
que corre el servidor. Para backup, copiar la carpeta `data/`.

## Acceso

La primera vez que arranca, se crea el usuario inicial:

- Usuario: **admin**
- Contraseña: **Filamento2026**

> **Importante:** cambiala apenas entres, desde el botón **Clave** arriba a la derecha.
> El servidor escucha solo en `127.0.0.1`, así que no queda expuesto a la red, pero la
> clave por defecto es pública (está en este README).

## Cómo se usa

1. **Carretes** → cargá cada carrete con su peso NETO de filamento (1 kg neto = 1,2 kg
   en la balanza si el carrete plástico pesa 200 g). Si el carrete ya está empezado,
   poné los gramos que quedan hoy.
2. **Nueva impresión** → subí (o pegá con Ctrl/Cmd+V) la captura del resultado del corte.
3. Tocá **Leer gramos de la imagen**: se completan las filas con el total de gramos de
   cada filamento y, cuando se puede, se asigna el carrete por color.
4. Corregí lo que haga falta. El botón 🎨 de cada fila permite hacer clic sobre el
   cuadradito de color de la imagen para elegir el carrete automáticamente.
5. **Descontar del stock**: se restan los gramos y queda registrada la impresión.

Si una impresión se cargó mal, en **Historial** se puede **Revertir** y los gramos
vuelven al carrete.

## Cómo está armado

| Archivo | Para qué |
|---|---|
| `public/index.html` · `public/styles.css` · `public/app.js` | **La interfaz.** Es una sola y se comparte entre las tres versiones |
| `laravel/` | Versión de producción: PHP + MySQL, para hosting compartido |
| `server.js` | Servidor Node sin dependencias: API, sesiones y guardado en `data/` |
| `index.html` | Entrada de GitHub Pages: levanta la misma interfaz y le enchufa el backend del navegador |
| `backend-local.js` | Reemplaza la API del servidor cuando no hay servidor (guarda en el navegador) |

Las tres versiones hablan **la misma API**, así que la interfaz no se duplica:
se toca en un solo lugar y `laravel/sincronizar-ui.sh` la copia dentro de Laravel.

## Nota sobre la lectura automática

El OCR usa Tesseract.js desde CDN: la primera vez necesita internet para descargar el
motor; después queda en caché del navegador. Los valores leídos son una **sugerencia**
y siempre se pueden corregir a mano antes de descontar.
