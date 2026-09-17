/* ============================================================
   Backend local para la versión publicada en GitHub Pages.

   GitHub Pages sirve solo archivos estáticos: no hay Node ni servidor.
   Este archivo intercepta las llamadas a /api/* y las resuelve contra
   el almacenamiento del propio navegador, con la misma interfaz que
   expone server.js. Así public/app.js funciona sin ningún cambio.

   Los datos quedan guardados en ESTE navegador únicamente.
   ============================================================ */
(() => {
  const LLAVE = 'gestorFilamento.db';
  const CLAVE_INICIAL = 'Filamento2026';
  const fetchOriginal = window.fetch.bind(window);

  /* ------------------------------------------------ almacenamiento */

  const vacia = () => ({
    usuarios: [],
    carretes: [],
    impresiones: [],
    movimientos: [],
    config: { alertaBajo: 150, moneda: '$' },
    sesion: null,
  });

  let db;
  try {
    db = Object.assign(vacia(), JSON.parse(localStorage.getItem(LLAVE) || '{}'));
  } catch {
    db = vacia();
  }

  let avisoEspacio = false;
  function guardar() {
    try {
      localStorage.setItem(LLAVE, JSON.stringify(db));
    } catch {
      // se llenó el almacenamiento del navegador: soltamos las capturas viejas
      let soltadas = 0;
      for (let i = db.impresiones.length - 1; i >= 0 && soltadas < 5; i--)
        if (db.impresiones[i].imagen) { db.impresiones[i].imagen = null; soltadas++; }
      try {
        localStorage.setItem(LLAVE, JSON.stringify(db));
        if (!avisoEspacio) {
          avisoEspacio = true;
          alert('El navegador se quedó sin espacio: se borraron las capturas más viejas del historial. Los gramos y el stock se conservan.');
        }
      } catch {}
    }
  }

  const id = () => Math.random().toString(36).slice(2, 11);
  const ahora = () => new Date().toISOString();
  const redondear = (n) => Math.round(n * 100) / 100;
  const num = (v, def = 0) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : def;
  };
  const texto = (v, max = 200) => String(v ?? '').trim().slice(0, max);

  /* ------------------------------------------------ contraseñas */

  async function hashClave(clave, sal) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(sal), iterations: 150000, hash: 'SHA-256' },
      base,
      256
    );
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function crearUsuario(usuario, clave, nombre) {
    const sal = id() + id();
    db.usuarios.push({ id: id(), usuario, nombre, sal, hash: await hashClave(clave, sal) });
    guardar();
  }

  async function verificar(usuario, clave) {
    const u = db.usuarios.find((x) => x.usuario === String(usuario || '').toLowerCase().trim());
    if (!u) return null;
    return (await hashClave(clave, u.sal)) === u.hash ? u : null;
  }

  const listo = (async () => {
    if (!db.usuarios.length) await crearUsuario('admin', CLAVE_INICIAL, 'Administrador');
  })();

  /* ------------------------------------------------ lógica (igual que server.js) */

  function registrarMovimiento(carreteId, tipo, gramos, saldo, motivo, ref) {
    db.movimientos.unshift({
      id: id(), carreteId, tipo,
      gramos: redondear(gramos), saldo: redondear(saldo),
      motivo: motivo || '', ref: ref || null, fecha: ahora(),
    });
    if (db.movimientos.length > 2000) db.movimientos.length = 2000;
  }

  function normalizarCarrete(entrada, base = {}) {
    return {
      marca: texto(entrada.marca ?? base.marca ?? '', 60),
      material: texto(entrada.material ?? base.material ?? 'PLA', 20),
      colorNombre: texto(entrada.colorNombre ?? base.colorNombre ?? '', 40),
      colorHex: /^#[0-9a-f]{6}$/i.test(entrada.colorHex || '')
        ? entrada.colorHex.toLowerCase()
        : base.colorHex || '#cccccc',
      pesoInicial: Math.max(0, num(entrada.pesoInicial, base.pesoInicial ?? 1000)),
      tara: Math.max(0, num(entrada.tara, base.tara ?? 0)),
      costo: Math.max(0, num(entrada.costo, base.costo ?? 0)),
      ubicacion: texto(entrada.ubicacion ?? base.ubicacion ?? '', 40),
      notas: texto(entrada.notas ?? base.notas ?? '', 500),
    };
  }

  function resumen() {
    const activos = db.carretes.filter((c) => !c.archivado);
    const restante = activos.reduce((a, c) => a + c.pesoRestante, 0);
    const inicial = activos.reduce((a, c) => a + c.pesoInicial, 0);
    const impresiones = db.impresiones.filter((i) => !i.revertida);
    return {
      carretes: activos.length,
      gramosRestantes: redondear(restante),
      gramosIniciales: redondear(inicial),
      gramosConsumidos: redondear(inicial - restante),
      bajos: activos.filter((c) => c.pesoRestante <= db.config.alertaBajo).length,
      impresiones: impresiones.length,
      costoImpreso: redondear(impresiones.reduce((a, i) => a + (i.costoTotal || 0), 0)),
    };
  }

  const estadoCompleto = () => ({
    carretes: db.carretes,
    impresiones: db.impresiones.slice(0, 200),
    movimientos: db.movimientos.slice(0, 300),
    config: db.config,
    resumen: resumen(),
  });

  /** Achica la captura para que entre en el almacenamiento del navegador. */
  function achicarImagen(dataUrl) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        const escala = Math.min(1, 520 / im.width);
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * escala);
        c.height = Math.round(im.height * escala);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.7));
      };
      im.onerror = () => resolve(null);
      im.src = dataUrl;
    });
  }

  /* ------------------------------------------------ rutas */

  const rutas = {
    'POST /login': async (b) => {
      const u = await verificar(b.usuario, b.clave);
      if (!u) return [401, { error: 'Usuario o contraseña incorrectos.' }];
      db.sesion = u.id;
      guardar();
      return [200, { usuario: { usuario: u.usuario, nombre: u.nombre } }];
    },
    'POST /logout': async () => {
      db.sesion = null;
      guardar();
      return [200, { ok: true }];
    },
    'GET /me': async () => {
      const u = db.usuarios.find((x) => x.id === db.sesion);
      return u ? [200, { usuario: { usuario: u.usuario, nombre: u.nombre } }] : [401, { error: 'Sin sesión.' }];
    },
    'POST /clave': async (b) => {
      const u = db.usuarios.find((x) => x.id === db.sesion);
      if (!(await verificar(u.usuario, b.actual))) return [400, { error: 'La contraseña actual no coincide.' }];
      if (!b.nueva || String(b.nueva).length < 6)
        return [400, { error: 'La nueva contraseña debe tener al menos 6 caracteres.' }];
      u.sal = id() + id();
      u.hash = await hashClave(String(b.nueva), u.sal);
      guardar();
      return [200, { ok: true }];
    },

    'GET /estado': async () => [200, estadoCompleto()],

    'POST /config': async (b) => {
      if (b.alertaBajo !== undefined) db.config.alertaBajo = Math.max(0, num(b.alertaBajo, 150));
      if (b.moneda !== undefined) db.config.moneda = texto(b.moneda, 5) || '$';
      guardar();
      return [200, estadoCompleto()];
    },

    'POST /carretes': async (b) => {
      const base = normalizarCarrete(b);
      if (!base.marca && !base.colorNombre)
        return [400, { error: 'Indicá al menos la marca o el nombre del color.' }];
      if (base.pesoInicial <= 0) return [400, { error: 'El peso neto del carrete debe ser mayor a 0.' }];
      const restante =
        b.pesoRestante === undefined || b.pesoRestante === ''
          ? base.pesoInicial
          : Math.min(base.pesoInicial, Math.max(0, num(b.pesoRestante)));
      const c = { id: id(), ...base, pesoRestante: redondear(restante), archivado: false, creado: ahora() };
      db.carretes.push(c);
      registrarMovimiento(c.id, 'carga', restante, restante, 'Alta del carrete', null);
      guardar();
      return [200, estadoCompleto()];
    },

    'PUT /carretes/:id': async (b, p) => {
      const c = db.carretes.find((x) => x.id === p.id);
      if (!c) return [404, { error: 'Carrete no encontrado.' }];
      Object.assign(c, normalizarCarrete(b, c));
      if (c.pesoRestante > c.pesoInicial) c.pesoRestante = c.pesoInicial;
      guardar();
      return [200, estadoCompleto()];
    },

    'POST /carretes/:id/ajuste': async (b, p) => {
      const c = db.carretes.find((x) => x.id === p.id);
      if (!c) return [404, { error: 'Carrete no encontrado.' }];
      const nuevo = Math.max(0, Math.min(c.pesoInicial, num(b.pesoRestante, c.pesoRestante)));
      const delta = nuevo - c.pesoRestante;
      c.pesoRestante = redondear(nuevo);
      registrarMovimiento(c.id, 'ajuste', delta, c.pesoRestante, texto(b.motivo, 200) || 'Ajuste manual de stock', null);
      guardar();
      return [200, estadoCompleto()];
    },

    'POST /carretes/:id/recargar': async (b, p) => {
      const c = db.carretes.find((x) => x.id === p.id);
      if (!c) return [404, { error: 'Carrete no encontrado.' }];
      const gramos = Math.max(0, num(b.gramos, c.pesoInicial));
      c.pesoInicial = redondear(gramos);
      c.pesoRestante = redondear(gramos);
      registrarMovimiento(c.id, 'carga', gramos, gramos, 'Carrete nuevo / repuesto', null);
      guardar();
      return [200, estadoCompleto()];
    },

    'DELETE /carretes/:id': async (b, p) => {
      const c = db.carretes.find((x) => x.id === p.id);
      if (!c) return [404, { error: 'Carrete no encontrado.' }];
      c.archivado = !c.archivado;
      guardar();
      return [200, estadoCompleto()];
    },

    'POST /impresiones': async (b) => {
      const lineas = [];
      for (const l of Array.isArray(b.lineas) ? b.lineas : []) {
        const gramos = redondear(num(l.gramos));
        if (gramos <= 0) continue;
        const c = db.carretes.find((x) => x.id === l.carreteId);
        if (!c) return [400, { error: 'Hay una fila sin carrete asignado.' }];
        lineas.push({
          carreteId: c.id, gramos, etiqueta: texto(l.etiqueta, 60),
          colorHex: /^#[0-9a-f]{6}$/i.test(l.colorHex || '') ? l.colorHex.toLowerCase() : c.colorHex,
        });
      }
      if (!lineas.length) return [400, { error: 'Cargá al menos un consumo con gramos.' }];

      const porCarrete = new Map();
      for (const l of lineas) porCarrete.set(l.carreteId, (porCarrete.get(l.carreteId) || 0) + l.gramos);
      if (!b.forzar) {
        const faltantes = [];
        for (const [cid, gr] of porCarrete) {
          const c = db.carretes.find((x) => x.id === cid);
          if (gr > c.pesoRestante + 0.001)
            faltantes.push(`${c.marca || ''} ${c.colorNombre || ''}`.trim() +
              ` (necesita ${redondear(gr)} g, quedan ${redondear(c.pesoRestante)} g)`);
        }
        if (faltantes.length)
          return [409, { error: 'No alcanza el filamento en: ' + faltantes.join('; '), requiereConfirmacion: true }];
      }

      let imagen = null;
      if (typeof b.imagen === 'string' && b.imagen.startsWith('data:image/')) imagen = await achicarImagen(b.imagen);

      const impresion = {
        id: id(),
        nombre: texto(b.nombre, 120) || 'Impresión sin nombre',
        fecha: texto(b.fecha, 30) || ahora(),
        notas: texto(b.notas, 500),
        imagen, lineas,
        totalGramos: redondear(lineas.reduce((a, l) => a + l.gramos, 0)),
        costoTotal: 0, revertida: false, creado: ahora(),
      };

      let costo = 0;
      for (const l of lineas) {
        const c = db.carretes.find((x) => x.id === l.carreteId);
        c.pesoRestante = redondear(Math.max(0, c.pesoRestante - l.gramos));
        if (c.costo && c.pesoInicial) costo += (c.costo / c.pesoInicial) * l.gramos;
        registrarMovimiento(c.id, 'consumo', -l.gramos, c.pesoRestante, impresion.nombre, impresion.id);
      }
      impresion.costoTotal = redondear(costo);
      db.impresiones.unshift(impresion);
      guardar();
      return [200, { ...estadoCompleto(), impresion }];
    },

    'POST /impresiones/:id/revertir': async (b, p) => {
      const imp = db.impresiones.find((x) => x.id === p.id);
      if (!imp) return [404, { error: 'Impresión no encontrada.' }];
      if (imp.revertida) return [400, { error: 'Esa impresión ya fue revertida.' }];
      for (const l of imp.lineas) {
        const c = db.carretes.find((x) => x.id === l.carreteId);
        if (!c) continue;
        c.pesoRestante = redondear(Math.min(c.pesoInicial, c.pesoRestante + l.gramos));
        registrarMovimiento(c.id, 'devolucion', l.gramos, c.pesoRestante, 'Reversión: ' + imp.nombre, imp.id);
      }
      imp.revertida = true;
      guardar();
      return [200, estadoCompleto()];
    },

    'DELETE /impresiones/:id': async (b, p) => {
      const i = db.impresiones.findIndex((x) => x.id === p.id);
      if (i === -1) return [404, { error: 'Impresión no encontrada.' }];
      if (!db.impresiones[i].revertida) return [400, { error: 'Revertí la impresión antes de borrarla.' }];
      db.impresiones.splice(i, 1);
      guardar();
      return [200, estadoCompleto()];
    },
  };

  const PUBLICAS = new Set(['POST /login', 'GET /me']);

  function emparejar(metodo, ruta) {
    if (rutas[`${metodo} ${ruta}`]) return { fn: rutas[`${metodo} ${ruta}`], params: {}, clave: `${metodo} ${ruta}` };
    for (const clave of Object.keys(rutas)) {
      const [m, patron] = clave.split(' ');
      if (m !== metodo || !patron.includes(':')) continue;
      const pa = patron.split('/'), ra = ruta.split('/');
      if (pa.length !== ra.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < pa.length; i++) {
        if (pa[i].startsWith(':')) params[pa[i].slice(1)] = decodeURIComponent(ra[i]);
        else if (pa[i] !== ra[i]) { ok = false; break; }
      }
      if (ok) return { fn: rutas[clave], params, clave };
    }
    return null;
  }

  const responder = (codigo, datos) =>
    new Response(JSON.stringify(datos), { status: codigo, headers: { 'Content-Type': 'application/json' } });

  /* ------------------------------------------------ intercepción */

  window.fetch = async (entrada, opciones = {}) => {
    const url = typeof entrada === 'string' ? entrada : entrada.url;
    const ruta = String(url).replace(/^https?:\/\/[^/]+/, '');
    if (!ruta.startsWith('/api/')) return fetchOriginal(entrada, opciones);

    await listo;
    const metodo = (opciones.method || 'GET').toUpperCase();
    const enc = emparejar(metodo, ruta.slice(4));
    if (!enc) return responder(404, { error: 'Ruta no encontrada.' });
    if (!PUBLICAS.has(enc.clave) && !db.sesion) return responder(401, { error: 'Necesitás iniciar sesión.' });

    let cuerpo = {};
    try { cuerpo = opciones.body ? JSON.parse(opciones.body) : {}; } catch {}
    try {
      const [codigo, datos] = await enc.fn(cuerpo, enc.params);
      return responder(codigo, datos);
    } catch (e) {
      return responder(400, { error: e.message || 'Error inesperado.' });
    }
  };

  /* ------------------------------------------------ cartel informativo */

  const mostrarCartel = () => {
    if (document.querySelector('.cartel-local')) return;
    const barra = document.createElement('div');
    barra.className = 'cartel-local';
    barra.innerHTML =
      '<strong>Versión de demostración.</strong> Los carretes y las impresiones se guardan solo en este navegador ' +
      '(no se comparten entre computadoras y se pierden si borrás los datos de navegación). ' +
      'Para uso real, instalá la versión con servidor del repositorio.';
    document.body.prepend(barra);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostrarCartel);
  else mostrarCartel();
})();
