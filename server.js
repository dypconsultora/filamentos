/**
 * Gestor de Filamento 3D - servidor local
 * Sin dependencias externas: solo Node.js.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUERTO = Number(process.env.PORT || 4173);
const RAIZ = __dirname;
const DIR_DATOS = path.join(RAIZ, 'data');
const DIR_SUBIDAS = path.join(DIR_DATOS, 'uploads');
const ARCHIVO_DB = path.join(DIR_DATOS, 'db.json');
const DIR_PUBLICO = path.join(RAIZ, 'public');
const LIMITE_CUERPO = 20 * 1024 * 1024; // 20 MB

fs.mkdirSync(DIR_SUBIDAS, { recursive: true });

/* ---------------------------------------------------------------- BASE DE DATOS */

const DB_VACIA = {
  usuarios: [],
  carretes: [],
  impresiones: [],
  movimientos: [],
  sesiones: {},
  config: { alertaBajo: 150, moneda: '$' },
};

let db = cargarDb();

function cargarDb() {
  try {
    const crudo = JSON.parse(fs.readFileSync(ARCHIVO_DB, 'utf8'));
    return Object.assign({}, DB_VACIA, crudo);
  } catch {
    return JSON.parse(JSON.stringify(DB_VACIA));
  }
}

let guardadoPendiente = null;
function guardarDb() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(() => {
    const tmp = ARCHIVO_DB + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, ARCHIVO_DB);
  }, 30);
}

const id = () => crypto.randomBytes(9).toString('hex');
const ahora = () => new Date().toISOString();

/* ---------------------------------------------------------------- USUARIOS */

function hashClave(clave, sal) {
  return crypto.scryptSync(clave, sal, 64).toString('hex');
}

function crearUsuario(usuario, clave, nombre) {
  const sal = crypto.randomBytes(16).toString('hex');
  const u = {
    id: id(),
    usuario: usuario.toLowerCase(),
    nombre: nombre || usuario,
    sal,
    hash: hashClave(clave, sal),
    creado: ahora(),
  };
  db.usuarios.push(u);
  guardarDb();
  return u;
}

const CLAVE_INICIAL = 'Filamento2026';
if (!db.usuarios.length) {
  crearUsuario('admin', CLAVE_INICIAL, 'Administrador');
  console.log(`\n  Usuario inicial creado -> admin / ${CLAVE_INICIAL}\n`);
}

function verificar(usuario, clave) {
  const u = db.usuarios.find((x) => x.usuario === String(usuario || '').toLowerCase().trim());
  if (!u) return null;
  const intento = Buffer.from(hashClave(clave, u.sal), 'hex');
  const real = Buffer.from(u.hash, 'hex');
  if (intento.length !== real.length) return null;
  return crypto.timingSafeEqual(intento, real) ? u : null;
}

const DURACION_SESION = 1000 * 60 * 60 * 24 * 14;

function abrirSesion(usuarioId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sesiones[token] = { usuarioId, vence: Date.now() + DURACION_SESION };
  guardarDb();
  return token;
}

function sesionDe(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k, decodeURIComponent(v)])
  );
  const token = cookies.sesion;
  if (!token) return null;
  const s = db.sesiones[token];
  if (!s || s.vence < Date.now()) {
    if (s) delete db.sesiones[token];
    return null;
  }
  const usuario = db.usuarios.find((u) => u.id === s.usuarioId);
  return usuario ? { token, usuario } : null;
}

/* ---------------------------------------------------------------- HELPERS HTTP */

function json(res, codigo, datos, cabeceras = {}) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...cabeceras,
  });
  res.end(cuerpo);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const partes = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > LIMITE_CUERPO) {
        reject(new Error('El archivo es demasiado grande (máx. 20 MB).'));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => {
      if (!partes.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8')));
      } catch {
        reject(new Error('Cuerpo JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

const num = (v, def = 0) => {
  const n = Number(String(v ?? '').toString().replace(',', '.'));
  return Number.isFinite(n) ? n : def;
};
const redondear = (n) => Math.round(n * 100) / 100;
const texto = (v, max = 200) => String(v ?? '').trim().slice(0, max);

/* ---------------------------------------------------------------- LÓGICA */

function registrarMovimiento(carreteId, tipo, gramos, saldo, motivo, ref) {
  db.movimientos.unshift({
    id: id(),
    carreteId,
    tipo, // carga | consumo | devolucion | ajuste
    gramos: redondear(gramos),
    saldo: redondear(saldo),
    motivo: motivo || '',
    ref: ref || null,
    fecha: ahora(),
  });
  if (db.movimientos.length > 5000) db.movimientos.length = 5000;
}

function normalizarCarrete(entrada, base = {}) {
  const pesoInicial = Math.max(0, num(entrada.pesoInicial, base.pesoInicial ?? 1000));
  return {
    marca: texto(entrada.marca ?? base.marca ?? '', 60),
    material: texto(entrada.material ?? base.material ?? 'PLA', 20),
    colorNombre: texto(entrada.colorNombre ?? base.colorNombre ?? '', 40),
    colorHex: /^#[0-9a-f]{6}$/i.test(entrada.colorHex || '')
      ? entrada.colorHex.toLowerCase()
      : base.colorHex || '#cccccc',
    pesoInicial,
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

/* ---------------------------------------------------------------- RUTAS API */

const rutas = {
  'POST /api/login': async (req, res) => {
    const { usuario, clave } = await leerCuerpo(req);
    const u = verificar(usuario, clave);
    if (!u) return json(res, 401, { error: 'Usuario o contraseña incorrectos.' });
    const token = abrirSesion(u.id);
    json(
      res,
      200,
      { usuario: { usuario: u.usuario, nombre: u.nombre } },
      {
        'Set-Cookie': `sesion=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${DURACION_SESION / 1000}`,
      }
    );
  },

  'POST /api/logout': async (req, res, ses) => {
    if (ses) delete db.sesiones[ses.token];
    guardarDb();
    json(res, 200, { ok: true }, { 'Set-Cookie': 'sesion=; HttpOnly; Path=/; Max-Age=0' });
  },

  'GET /api/me': async (req, res, ses) => {
    if (!ses) return json(res, 401, { error: 'Sin sesión.' });
    json(res, 200, { usuario: { usuario: ses.usuario.usuario, nombre: ses.usuario.nombre } });
  },

  'POST /api/clave': async (req, res, ses) => {
    const { actual, nueva } = await leerCuerpo(req);
    if (!verificar(ses.usuario.usuario, actual))
      return json(res, 400, { error: 'La contraseña actual no coincide.' });
    if (!nueva || String(nueva).length < 6)
      return json(res, 400, { error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    ses.usuario.sal = crypto.randomBytes(16).toString('hex');
    ses.usuario.hash = hashClave(String(nueva), ses.usuario.sal);
    guardarDb();
    json(res, 200, { ok: true });
  },

  'GET /api/estado': async (req, res) => json(res, 200, estadoCompleto()),

  'POST /api/config': async (req, res) => {
    const body = await leerCuerpo(req);
    if (body.alertaBajo !== undefined) db.config.alertaBajo = Math.max(0, num(body.alertaBajo, 150));
    if (body.moneda !== undefined) db.config.moneda = texto(body.moneda, 5) || '$';
    guardarDb();
    json(res, 200, estadoCompleto());
  },

  /* ---- carretes ---- */

  'POST /api/carretes': async (req, res) => {
    const body = await leerCuerpo(req);
    const base = normalizarCarrete(body);
    if (!base.marca && !base.colorNombre)
      return json(res, 400, { error: 'Indicá al menos la marca o el nombre del color.' });
    if (base.pesoInicial <= 0)
      return json(res, 400, { error: 'El peso neto del carrete debe ser mayor a 0.' });
    const restanteInicial =
      body.pesoRestante === undefined || body.pesoRestante === ''
        ? base.pesoInicial
        : Math.min(base.pesoInicial, Math.max(0, num(body.pesoRestante)));
    const carrete = {
      id: id(),
      ...base,
      pesoRestante: redondear(restanteInicial),
      archivado: false,
      creado: ahora(),
    };
    db.carretes.push(carrete);
    registrarMovimiento(carrete.id, 'carga', restanteInicial, restanteInicial, 'Alta del carrete', null);
    guardarDb();
    json(res, 200, estadoCompleto());
  },

  'PUT /api/carretes/:id': async (req, res, ses, params) => {
    const c = db.carretes.find((x) => x.id === params.id);
    if (!c) return json(res, 404, { error: 'Carrete no encontrado.' });
    const body = await leerCuerpo(req);
    Object.assign(c, normalizarCarrete(body, c));
    if (c.pesoRestante > c.pesoInicial) c.pesoRestante = c.pesoInicial;
    guardarDb();
    json(res, 200, estadoCompleto());
  },

  'POST /api/carretes/:id/ajuste': async (req, res, ses, params) => {
    const c = db.carretes.find((x) => x.id === params.id);
    if (!c) return json(res, 404, { error: 'Carrete no encontrado.' });
    const body = await leerCuerpo(req);
    const nuevo = Math.max(0, Math.min(c.pesoInicial, num(body.pesoRestante, c.pesoRestante)));
    const delta = nuevo - c.pesoRestante;
    c.pesoRestante = redondear(nuevo);
    registrarMovimiento(
      c.id,
      'ajuste',
      delta,
      c.pesoRestante,
      texto(body.motivo, 200) || 'Ajuste manual de stock',
      null
    );
    guardarDb();
    json(res, 200, estadoCompleto());
  },

  'POST /api/carretes/:id/recargar': async (req, res, ses, params) => {
    const c = db.carretes.find((x) => x.id === params.id);
    if (!c) return json(res, 404, { error: 'Carrete no encontrado.' });
    const body = await leerCuerpo(req);
    const gramos = Math.max(0, num(body.gramos, c.pesoInicial));
    c.pesoInicial = redondear(gramos);
    c.pesoRestante = redondear(gramos);
    registrarMovimiento(c.id, 'carga', gramos, gramos, 'Carrete nuevo / repuesto', null);
    guardarDb();
    json(res, 200, estadoCompleto());
  },

  'DELETE /api/carretes/:id': async (req, res, ses, params) => {
    const c = db.carretes.find((x) => x.id === params.id);
    if (!c) return json(res, 404, { error: 'Carrete no encontrado.' });
    c.archivado = !c.archivado;
    guardarDb();
    json(res, 200, estadoCompleto());
  },

  /* ---- impresiones ---- */

  'POST /api/impresiones': async (req, res) => {
    const body = await leerCuerpo(req);
    const lineasEntrada = Array.isArray(body.lineas) ? body.lineas : [];
    const lineas = [];

    for (const l of lineasEntrada) {
      const gramos = redondear(num(l.gramos));
      if (gramos <= 0) continue;
      const carrete = db.carretes.find((c) => c.id === l.carreteId);
      if (!carrete) return json(res, 400, { error: 'Hay una fila sin carrete asignado.' });
      lineas.push({
        carreteId: carrete.id,
        gramos,
        etiqueta: texto(l.etiqueta, 60),
        colorHex: /^#[0-9a-f]{6}$/i.test(l.colorHex || '') ? l.colorHex.toLowerCase() : carrete.colorHex,
      });
    }

    if (!lineas.length) return json(res, 400, { error: 'Cargá al menos un consumo con gramos.' });

    // Validación de stock (a menos que se fuerce)
    const porCarrete = new Map();
    for (const l of lineas) porCarrete.set(l.carreteId, (porCarrete.get(l.carreteId) || 0) + l.gramos);
    if (!body.forzar) {
      const faltantes = [];
      for (const [cid, g] of porCarrete) {
        const c = db.carretes.find((x) => x.id === cid);
        if (g > c.pesoRestante + 0.001)
          faltantes.push(
            `${c.marca || ''} ${c.colorNombre || ''}`.trim() +
              ` (necesita ${redondear(g)} g, quedan ${redondear(c.pesoRestante)} g)`
          );
      }
      if (faltantes.length)
        return json(res, 409, {
          error: 'No alcanza el filamento en: ' + faltantes.join('; '),
          requiereConfirmacion: true,
        });
    }

    // Imagen opcional
    let imagen = null;
    if (typeof body.imagen === 'string' && body.imagen.startsWith('data:image/')) {
      const m = body.imagen.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
      if (m) {
        const nombre = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
        fs.writeFileSync(path.join(DIR_SUBIDAS, nombre), Buffer.from(m[2], 'base64'));
        imagen = nombre;
      }
    }

    const impresion = {
      id: id(),
      nombre: texto(body.nombre, 120) || 'Impresión sin nombre',
      fecha: texto(body.fecha, 30) || ahora(),
      notas: texto(body.notas, 500),
      imagen,
      lineas,
      totalGramos: redondear(lineas.reduce((a, l) => a + l.gramos, 0)),
      costoTotal: 0,
      revertida: false,
      creado: ahora(),
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
    guardarDb();
    json(res, 200, { ...estadoCompleto(), impresion });
  },

  'POST /api/impresiones/:id/revertir': async (req, res, ses, params) => {
    const imp = db.impresiones.find((x) => x.id === params.id);
    if (!imp) return json(res, 404, { error: 'Impresión no encontrada.' });
    if (imp.revertida) return json(res, 400, { error: 'Esa impresión ya fue revertida.' });
    for (const l of imp.lineas) {
      const c = db.carretes.find((x) => x.id === l.carreteId);
      if (!c) continue;
      c.pesoRestante = redondear(Math.min(c.pesoInicial, c.pesoRestante + l.gramos));
      registrarMovimiento(c.id, 'devolucion', l.gramos, c.pesoRestante, 'Reversión: ' + imp.nombre, imp.id);
    }
    imp.revertida = true;
    guardarDb();
    json(res, 200, estadoCompleto());
  },

  'DELETE /api/impresiones/:id': async (req, res, ses, params) => {
    const i = db.impresiones.findIndex((x) => x.id === params.id);
    if (i === -1) return json(res, 404, { error: 'Impresión no encontrada.' });
    const imp = db.impresiones[i];
    if (!imp.revertida) return json(res, 400, { error: 'Revertí la impresión antes de borrarla.' });
    if (imp.imagen) { try { fs.unlinkSync(path.join(DIR_SUBIDAS, imp.imagen)); } catch {} }
    db.impresiones.splice(i, 1);
    guardarDb();
    json(res, 200, estadoCompleto());
  },
};

/* ---------------------------------------------------------------- ESTÁTICOS */

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function servirArchivo(res, archivo) {
  fs.readFile(archivo, (err, datos) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No encontrado');
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(datos);
  });
}

/* ---------------------------------------------------------------- SERVIDOR */

function emparejar(metodo, ruta) {
  const directo = rutas[`${metodo} ${ruta}`];
  if (directo) return { manejador: directo, params: {} };
  for (const clave of Object.keys(rutas)) {
    const [m, patron] = clave.split(' ');
    if (m !== metodo || !patron.includes(':')) continue;
    const pa = patron.split('/');
    const ra = ruta.split('/');
    if (pa.length !== ra.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pa.length; i++) {
      if (pa[i].startsWith(':')) params[pa[i].slice(1)] = decodeURIComponent(ra[i]);
      else if (pa[i] !== ra[i]) { ok = false; break; }
    }
    if (ok) return { manejador: rutas[clave], params };
  }
  return null;
}

const PUBLICAS = new Set(['POST /api/login', 'GET /api/me']);

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const ruta = url.pathname.replace(/\/+$/, '') || '/';
  const ses = sesionDe(req);

  if (ruta.startsWith('/api/')) {
    const enc = emparejar(req.method, ruta);
    if (!enc) return json(res, 404, { error: 'Ruta no encontrada.' });
    if (!PUBLICAS.has(`${req.method} ${ruta}`) && !ses)
      return json(res, 401, { error: 'Necesitás iniciar sesión.' });
    try {
      await enc.manejador(req, res, ses, enc.params);
    } catch (e) {
      if (!res.headersSent) json(res, 400, { error: e.message || 'Error inesperado.' });
    }
    return;
  }

  if (ruta.startsWith('/uploads/')) {
    if (!ses) {
      res.writeHead(401);
      return res.end();
    }
    const nombre = path.basename(ruta);
    return servirArchivo(res, path.join(DIR_SUBIDAS, nombre));
  }

  const rel = ruta === '/' ? 'index.html' : ruta.slice(1);
  const destino = path.join(DIR_PUBLICO, rel);
  if (!destino.startsWith(DIR_PUBLICO)) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(destino, (err, st) => {
    if (err || !st.isFile()) return servirArchivo(res, path.join(DIR_PUBLICO, 'index.html'));
    servirArchivo(res, destino);
  });
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`\n  Gestor de Filamento 3D`);
  console.log(`  ➜  http://localhost:${PUERTO}\n`);
});
