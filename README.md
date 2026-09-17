# Gestor de Filamento 3D

Control de stock de filamento por carrete, con descuento automático a partir de la
captura del **Resultado del corte** de Bambu Studio.

## Cómo levantarlo

```bash
node server.js
```

Después abrir http://localhost:4173

Para cambiar el puerto: `PORT=5000 node server.js`

## Acceso

La primera vez que arranca, el servidor crea el usuario inicial:

- Usuario: **admin**
- Contraseña: **Filamento2026**

> **Importante:** cambiá esa contraseña apenas entres, desde el botón **Clave**
> arriba a la derecha. El servidor escucha solo en `127.0.0.1`, así que la app no
> queda expuesta a la red, pero la clave por defecto es pública (está en este README).

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

## Datos

Todo se guarda en `data/db.json` y las capturas en `data/uploads/`.
Para hacer backup, copiar la carpeta `data/`.

## Nota sobre la lectura automática

La lectura de la imagen (OCR) usa Tesseract.js desde CDN: la primera vez necesita
internet para descargar el motor; después queda en caché del navegador.
Los valores leídos son una sugerencia — siempre se pueden corregir a mano antes de
descontar.
