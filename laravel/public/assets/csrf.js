/**
 * Puente entre la interfaz y Laravel.
 *
 * El front (public/app.js) es el mismo para las tres versiones y no sabe nada
 * de Laravel. Acá se le agrega a cada llamada el token CSRF que exige el
 * framework, sin tener que tocar el código de la interfaz.
 */
(() => {
  let token = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const fetchOriginal = window.fetch.bind(window);

  window.fetch = (entrada, opciones = {}) => {
    const url = String(typeof entrada === 'string' ? entrada : entrada.url);
    const metodo = (opciones.method || 'GET').toUpperCase();

    if (url.includes('/api/')) {
      opciones.headers = {
        ...(opciones.headers || {}),
        'X-Requested-With': 'XMLHttpRequest',
        ...(metodo === 'GET' ? {} : { 'X-CSRF-TOKEN': token }),
      };
      opciones.credentials = 'same-origin';
    }

    const respuesta = fetchOriginal(entrada, opciones);

    // Entrar y salir regeneran la sesión, y con ella el token: hay que renovarlo
    // o las llamadas siguientes fallarían con "la sesión venció".
    if (/\/api\/(login|logout)$/.test(url)) {
      return respuesta.then(async (r) => {
        try {
          const datos = await r.clone().json();
          if (datos && datos.csrf) token = datos.csrf;
        } catch {}
        return r;
      });
    }

    return respuesta;
  };
})();
