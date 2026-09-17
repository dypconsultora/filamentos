#!/bin/bash
# ---------------------------------------------------------------------------
# La interfaz (public/index.html, app.js y styles.css del repositorio) es una
# sola y se comparte entre las tres versiones: la de Node, la estática de
# GitHub Pages y esta de Laravel.
#
# Este script la copia acá adentro y genera la vista Blade, agregándole el
# token CSRF. Hay que correrlo cada vez que se toca la interfaz, y antes de
# subir a producción.
# ---------------------------------------------------------------------------
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/.." && pwd)"

mkdir -p "$AQUI/public/assets" "$AQUI/resources/views"
cp "$RAIZ/public/app.js" "$AQUI/public/assets/app.js"
cp "$RAIZ/public/styles.css" "$AQUI/public/assets/styles.css"

sed \
  -e 's#href="styles.css"#href="/assets/styles.css"#' \
  -e 's#<meta charset="utf-8" />#<meta charset="utf-8" />\n<meta name="csrf-token" content="{{ csrf_token() }}" />#' \
  -e 's#<script src="app.js"></script>#<script src="/assets/csrf.js"></script>\n<script src="/assets/app.js"></script>#' \
  "$RAIZ/public/index.html" > "$AQUI/resources/views/app.blade.php"

echo "Interfaz sincronizada:"
echo "  - public/assets/app.js"
echo "  - public/assets/styles.css"
echo "  - resources/views/app.blade.php"
