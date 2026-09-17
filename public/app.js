/* ============================================================
   Gestor de Filamento 3D — front-end
   ============================================================ */

const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

let estado = { carretes: [], impresiones: [], movimientos: [], config: {}, resumen: {} };
let filas = [];          // filas de consumo de la impresión en curso
let imagenDataUrl = null;
let modoGota = null;     // id de fila esperando el cuentagotas
let imgOriginal = null;  // Image() cargada

/* ---------------------------------------------------------------- utilidades */

const g = (n) => `${(Math.round(n * 100) / 100).toLocaleString('es-AR')} g`;
const plata = (n) => `${estado.config.moneda || '$'} ${(Math.round(n * 100) / 100).toLocaleString('es-AR')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nombreCarrete = (c) =>
  [c.marca, c.material, c.colorNombre].filter(Boolean).join(' · ') || 'Carrete sin nombre';
const carrete = (id) => estado.carretes.find((c) => c.id === id);

function toast(msg, tipo = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + tipo;
  el.textContent = msg;
  $('#avisos').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function api(ruta, opciones = {}) {
  const res = await fetch('/api' + ruta, {
    method: opciones.method || 'GET',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  let datos = {};
  try { datos = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(datos.error || 'Error de conexión');
    err.datos = datos;
    err.status = res.status;
    throw err;
  }
  return datos;
}

function aplicarEstado(datos) {
  if (!datos || !datos.carretes) return;
  estado = datos;
  render();
}

async function refrescar() {
  aplicarEstado(await api('/estado'));
}

/* ---------------------------------------------------------------- login */

$('#formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $('#errorLogin').textContent = '';
  try {
    const r = await api('/login', {
      method: 'POST',
      body: { usuario: fd.get('usuario'), clave: fd.get('clave') },
    });
    entrar(r.usuario);
  } catch (err) {
    $('#errorLogin').textContent = err.message;
  }
});

async function entrar(usuario) {
  $('#nombreUsuario').textContent = usuario.nombre || usuario.usuario;
  $('#pantallaLogin').classList.add('oculto');
  $('#app').classList.remove('oculto');
  $('#impFecha').value = new Date().toISOString().slice(0, 10);
  if (!filas.length) agregarFila();
  await refrescar();
}

$('#btnSalir').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' });
  location.reload();
});

$('#btnClave').addEventListener('click', () => $('#modalClave').classList.remove('oculto'));
$('#cerrarModalClave').addEventListener('click', () => $('#modalClave').classList.add('oculto'));
$('#formClave').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/clave', { method: 'POST', body: { actual: fd.get('actual'), nueva: fd.get('nueva') } });
    toast('Contraseña actualizada.', 'ok');
    $('#modalClave').classList.add('oculto');
    e.target.reset();
  } catch (err) { toast(err.message, 'err'); }
});

/* ---------------------------------------------------------------- navegación */

$$('.tab').forEach((t) =>
  t.addEventListener('click', () => irA(t.dataset.vista)));
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir]');
  if (b) irA(b.dataset.ir);
});
function irA(vista) {
  $$('.tab').forEach((x) => x.classList.toggle('activo', x.dataset.vista === vista));
  $$('.vista').forEach((v) => v.classList.toggle('activo', v.id === 'vista-' + vista));
  window.scrollTo({ top: 0 });
}

/* ---------------------------------------------------------------- render */

function render() {
  renderKpis();
  renderStock();
  renderListaCarretes();
  renderSelectsFilas();
  renderHistorial();
  renderUltimas();
  renderMovimientos();
  $('#alertaBajo').value = estado.config.alertaBajo ?? 150;
  actualizarTotales();
}

function renderKpis() {
  const r = estado.resumen || {};
  const kpis = [
    { t: 'Carretes activos', v: r.carretes ?? 0 },
    { t: 'Filamento disponible', v: g(r.gramosRestantes ?? 0) },
    { t: 'Consumido total', v: g(r.gramosConsumidos ?? 0) },
    { t: 'Impresiones', v: r.impresiones ?? 0 },
    { t: 'Costo impreso', v: plata(r.costoImpreso ?? 0) },
    { t: 'Carretes en rojo', v: r.bajos ?? 0, warn: (r.bajos ?? 0) > 0 },
  ];
  $('#kpis').innerHTML = kpis
    .map((k) => `<div class="kpi ${k.warn ? 'warn' : ''}"><div class="v">${esc(k.v)}</div><div class="t">${k.t}</div></div>`)
    .join('');
}

function colorBarra(pct, bajo) {
  if (pct <= 8) return '#ef4444';
  if (bajo) return '#f59e0b';
  return '#22c55e';
}

function renderStock() {
  const activos = estado.carretes.filter((c) => !c.archivado);
  if (!activos.length) {
    $('#gridStock').innerHTML =
      `<p class="vacio">Todavía no cargaste carretes. <button class="btn mini" data-ir="carretes">Cargar el primero</button></p>`;
    return;
  }
  const limite = estado.config.alertaBajo ?? 150;
  $('#gridStock').innerHTML = activos
    .slice()
    .sort((a, b) => a.pesoRestante - b.pesoRestante)
    .map((c) => {
      const pct = c.pesoInicial ? Math.max(0, Math.min(100, (c.pesoRestante / c.pesoInicial) * 100)) : 0;
      const bajo = c.pesoRestante <= limite;
      const vacio = c.pesoRestante <= 0;
      const etiqueta = vacio
        ? '<span class="etiqueta rojo">agotado</span>'
        : bajo
        ? '<span class="etiqueta alerta">bajo stock</span>'
        : `<span class="etiqueta">${Math.round(pct)}%</span>`;
      return `<div class="card-stock ${vacio ? 'vacio' : bajo ? 'bajo' : ''}">
        <div class="cs-top">
          <span class="punto" style="background:${esc(c.colorHex)}"></span>
          <div style="flex:1;min-width:0">
            <div class="cs-nombre">${esc(nombreCarrete(c))}</div>
            <div class="cs-sub">${esc(c.ubicacion || 'sin ubicación')}</div>
          </div>${etiqueta}
        </div>
        <div class="barra-prog"><i style="width:${pct}%;background:${colorBarra(pct, bajo)}"></i></div>
        <div class="cs-datos"><span><b>${g(c.pesoRestante)}</b> disponibles</span><span>de ${g(c.pesoInicial)}</span></div>
      </div>`;
    })
    .join('');
}

function renderListaCarretes() {
  const verArch = $('#verArchivados').checked;
  const lista = estado.carretes.filter((c) => verArch || !c.archivado);
  if (!lista.length) { $('#listaCarretes').innerHTML = '<p class="vacio">Sin carretes.</p>'; return; }
  $('#listaCarretes').innerHTML = lista
    .map(
      (c) => `<div class="item-carrete ${c.archivado ? 'archivado' : ''}">
      <span class="punto" style="background:${esc(c.colorHex)}"></span>
      <div class="info">
        <div class="nom">${esc(nombreCarrete(c))}</div>
        <div class="cs-sub">${g(c.pesoRestante)} de ${g(c.pesoInicial)}${c.costo ? ' · ' + plata(c.costo) : ''}${c.ubicacion ? ' · ' + esc(c.ubicacion) : ''}</div>
      </div>
      <button class="btn mini" data-editar="${c.id}">Editar</button>
      <button class="btn mini" data-ajustar="${c.id}">Ajustar</button>
      <button class="btn mini" data-recargar="${c.id}">Repuesto</button>
      <button class="btn mini peligro" data-archivar="${c.id}">${c.archivado ? 'Activar' : 'Archivar'}</button>
    </div>`
    )
    .join('');
}

function renderUltimas() {
  const ult = estado.impresiones.slice(0, 5);
  $('#ultimasImpresiones').innerHTML = ult.length
    ? ult.map(itemHistorial).join('')
    : '<p class="vacio">Todavía no registraste impresiones.</p>';
}

function itemHistorial(i) {
  const fecha = (i.fecha || i.creado || '').slice(0, 10);
  return `<div class="item-hist ${i.revertida ? 'revertida' : ''}">
    <div class="ih-top">
      <div>
        <strong>${esc(i.nombre)}</strong> ${i.revertida ? '<span class="etiqueta rojo">revertida</span>' : ''}
        <div class="cs-sub">${esc(fecha)} · ${g(i.totalGramos)}${i.costoTotal ? ' · ' + plata(i.costoTotal) : ''}</div>
        ${i.notas ? `<div class="cs-sub">${esc(i.notas)}</div>` : ''}
      </div>
      <div class="acciones">
        ${i.revertida
          ? `<button class="btn mini peligro" data-borrar-imp="${i.id}">Borrar</button>`
          : `<button class="btn mini" data-revertir="${i.id}">Revertir</button>`}
      </div>
    </div>
    <div class="ih-lineas">${i.lineas
      .map((l) => {
        const c = carrete(l.carreteId);
        return `<span class="pill"><span class="swatch-fila" style="background:${esc(l.colorHex || '#888')}"></span>${esc(
          c ? nombreCarrete(c) : 'carrete borrado'
        )} · <b>${g(l.gramos)}</b></span>`;
      })
      .join('')}</div>
    ${i.imagen ? `<img class="ih-img" src="/uploads/${esc(i.imagen)}" onclick="window.open(this.src)" alt="captura del corte" />` : ''}
  </div>`;
}

function renderHistorial() {
  $('#listaHistorial').innerHTML = estado.impresiones.length
    ? estado.impresiones.map(itemHistorial).join('')
    : '<p class="vacio">Sin impresiones registradas.</p>';
}

function renderMovimientos() {
  const sel = $('#filtroMovCarrete');
  const actual = sel.value;
  sel.innerHTML =
    '<option value="">Todos los carretes</option>' +
    estado.carretes.map((c) => `<option value="${c.id}">${esc(nombreCarrete(c))}</option>`).join('');
  sel.value = actual;
  const movs = estado.movimientos.filter((m) => !actual || m.carreteId === actual);
  $('#tablaMovimientos').innerHTML = movs.length
    ? movs
        .map((m) => {
          const c = carrete(m.carreteId);
          return `<tr>
            <td>${new Date(m.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td>${c ? `<span class="swatch-fila" style="background:${esc(c.colorHex)}"></span>${esc(nombreCarrete(c))}` : '—'}</td>
            <td>${esc(m.tipo)}</td>
            <td class="der ${m.gramos < 0 ? 'neg' : 'pos'}">${m.gramos > 0 ? '+' : ''}${g(m.gramos)}</td>
            <td class="der">${g(m.saldo)}</td>
            <td>${esc(m.motivo)}</td>
          </tr>`;
        })
        .join('')
    : '<tr><td colspan="6" class="vacio">Sin movimientos.</td></tr>';
}
$('#filtroMovCarrete').addEventListener('change', renderMovimientos);
$('#verArchivados').addEventListener('change', renderListaCarretes);

$('#alertaBajo').addEventListener('change', async (e) => {
  aplicarEstado(await api('/config', { method: 'POST', body: { alertaBajo: e.target.value } }));
});

/* ---------------------------------------------------------------- carretes */

const formCarrete = $('#formCarrete');

formCarrete.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(formCarrete));
  try {
    const datos = fd.id
      ? await api('/carretes/' + fd.id, { method: 'PUT', body: fd })
      : await api('/carretes', { method: 'POST', body: fd });
    aplicarEstado(datos);
    resetFormCarrete();
    toast(fd.id ? 'Carrete actualizado.' : 'Carrete cargado.', 'ok');
  } catch (err) { toast(err.message, 'err'); }
});

function resetFormCarrete() {
  formCarrete.reset();
  formCarrete.id.value = '';
  formCarrete.pesoInicial.value = 1000;
  formCarrete.tara.value = 200;
  formCarrete.colorHex.value = '#22c55e';
  $('#tituloFormCarrete').textContent = 'Cargar carrete nuevo';
  $('#btnGuardarCarrete').textContent = 'Guardar carrete';
  $('#campoRestante').classList.remove('oculto');
}
$('#btnCancelarCarrete').addEventListener('click', resetFormCarrete);

$$('.chip[data-neto]').forEach((b) =>
  b.addEventListener('click', () => {
    formCarrete.pesoInicial.value = b.dataset.neto;
    formCarrete.tara.value = b.dataset.tara;
  }));

document.addEventListener('click', async (e) => {
  const ed = e.target.closest('[data-editar]');
  if (ed) {
    const c = carrete(ed.dataset.editar);
    for (const k of ['marca', 'material', 'colorNombre', 'colorHex', 'pesoInicial', 'tara', 'costo', 'ubicacion', 'notas'])
      if (formCarrete[k]) formCarrete[k].value = c[k] ?? '';
    formCarrete.id.value = c.id;
    $('#campoRestante').classList.add('oculto');
    $('#tituloFormCarrete').textContent = 'Editando: ' + nombreCarrete(c);
    $('#btnGuardarCarrete').textContent = 'Guardar cambios';
    irA('carretes');
    formCarrete.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const aj = e.target.closest('[data-ajustar]');
  if (aj) {
    const c = carrete(aj.dataset.ajustar);
    const v = prompt(`Gramos disponibles reales de "${nombreCarrete(c)}"\n(máximo ${c.pesoInicial} g)`, c.pesoRestante);
    if (v === null) return;
    try {
      aplicarEstado(await api(`/carretes/${c.id}/ajuste`, { method: 'POST', body: { pesoRestante: v, motivo: 'Ajuste manual' } }));
      toast('Stock ajustado.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  const rec = e.target.closest('[data-recargar]');
  if (rec) {
    const c = carrete(rec.dataset.recargar);
    const v = prompt(`Carrete nuevo de "${nombreCarrete(c)}".\nGramos NETOS del repuesto:`, c.pesoInicial);
    if (v === null) return;
    try {
      aplicarEstado(await api(`/carretes/${c.id}/recargar`, { method: 'POST', body: { gramos: v } }));
      toast('Carrete repuesto a full.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  const ar = e.target.closest('[data-archivar]');
  if (ar) {
    try { aplicarEstado(await api('/carretes/' + ar.dataset.archivar, { method: 'DELETE' })); }
    catch (err) { toast(err.message, 'err'); }
  }

  const rev = e.target.closest('[data-revertir]');
  if (rev && confirm('¿Devolver los gramos de esta impresión al stock?')) {
    try {
      aplicarEstado(await api(`/impresiones/${rev.dataset.revertir}/revertir`, { method: 'POST' }));
      toast('Impresión revertida, gramos devueltos.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  const bo = e.target.closest('[data-borrar-imp]');
  if (bo && confirm('¿Borrar definitivamente este registro?')) {
    try { aplicarEstado(await api('/impresiones/' + bo.dataset.borrarImp, { method: 'DELETE' })); }
    catch (err) { toast(err.message, 'err'); }
  }
});

/* ---------------------------------------------------------------- filas de consumo */

function agregarFila(datos = {}) {
  filas.push({
    uid: Math.random().toString(36).slice(2),
    carreteId: datos.carreteId || '',
    gramos: datos.gramos ?? '',
    colorHex: datos.colorHex || null,
  });
  renderFilas();
}

function renderFilas() {
  const cuerpo = $('#filasConsumo');
  cuerpo.innerHTML = filas
    .map((f) => {
      const c = carrete(f.carreteId);
      const hex = f.colorHex || (c ? c.colorHex : '#3a4250');
      return `<tr data-uid="${f.uid}">
        <td><button class="btn-gota ${modoGota === f.uid ? 'activo' : ''}" data-gota="${f.uid}" title="Tomar el color desde la imagen">🎨</button></td>
        <td>
          <div style="display:flex;align-items:center;gap:7px">
            <span class="punto" style="width:18px;height:18px;background:${esc(hex)}"></span>
            <select data-campo="carreteId">${opcionesCarretes(f.carreteId)}</select>
          </div>
        </td>
        <td><input type="number" step="0.01" min="0" data-campo="gramos" value="${f.gramos}" placeholder="0" /></td>
        <td><button class="btn mini peligro" data-quitar="${f.uid}">✕</button></td>
      </tr>`;
    })
    .join('');
  actualizarTotales();
}

function opcionesCarretes(sel) {
  const activos = estado.carretes.filter((c) => !c.archivado);
  return (
    `<option value="">— elegir carrete —</option>` +
    activos
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(nombreCarrete(c))} (${Math.round(c.pesoRestante)} g)</option>`
      )
      .join('')
  );
}

function renderSelectsFilas() {
  $$('#filasConsumo select[data-campo="carreteId"]').forEach((s) => {
    const uid = s.closest('tr').dataset.uid;
    const f = filas.find((x) => x.uid === uid);
    s.innerHTML = opcionesCarretes(f ? f.carreteId : '');
  });
}

$('#filasConsumo').addEventListener('input', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const f = filas.find((x) => x.uid === tr.dataset.uid);
  if (!f) return;
  const campo = e.target.dataset.campo;
  if (campo === 'gramos') f.gramos = e.target.value;
  if (campo === 'carreteId') {
    f.carreteId = e.target.value;
    const c = carrete(f.carreteId);
    if (c) tr.querySelector('.punto').style.background = c.colorHex;
  }
  actualizarTotales();
});

$('#filasConsumo').addEventListener('click', (e) => {
  const q = e.target.closest('[data-quitar]');
  if (q) {
    filas = filas.filter((f) => f.uid !== q.dataset.quitar);
    if (!filas.length) agregarFila(); else renderFilas();
    return;
  }
  const gt = e.target.closest('[data-gota]');
  if (gt) {
    if (!imagenDataUrl) return toast('Primero subí la captura del corte.', 'err');
    modoGota = modoGota === gt.dataset.gota ? null : gt.dataset.gota;
    $('#zonaDrop').classList.toggle('cuentagotas', !!modoGota);
    renderFilas();
    if (modoGota) toast('Hacé clic en el cuadradito de color dentro de la imagen.');
  }
});

$('#btnAgregarFila').addEventListener('click', () => agregarFila());

function actualizarTotales() {
  let total = 0, costo = 0;
  const necesita = new Map();
  for (const f of filas) {
    const n = Number(String(f.gramos).replace(',', '.')) || 0;
    if (n <= 0) continue;
    total += n;
    const c = carrete(f.carreteId);
    if (c) {
      necesita.set(c.id, (necesita.get(c.id) || 0) + n);
      if (c.costo && c.pesoInicial) costo += (c.costo / c.pesoInicial) * n;
    }
  }
  $('#totalGramos').textContent = g(total);
  $('#totalCosto').textContent = costo ? plata(costo) : '—';

  const avisos = [];
  for (const [cid, n] of necesita) {
    const c = carrete(cid);
    if (n > c.pesoRestante + 0.001)
      avisos.push(`⚠️ <strong>${esc(nombreCarrete(c))}</strong>: necesitás ${g(n)} y quedan ${g(c.pesoRestante)}. Faltan ${g(n - c.pesoRestante)}.`);
    else if (c.pesoRestante - n <= (estado.config.alertaBajo ?? 150))
      avisos.push(`🔸 <strong>${esc(nombreCarrete(c))}</strong> queda en ${g(c.pesoRestante - n)} después de imprimir.`);
  }
  $('#avisoStock').innerHTML = avisos.map((a) => `<div class="aviso-linea warn">${a}</div>`).join('');
}

/* ---------------------------------------------------------------- imagen */

const zona = $('#zonaDrop');
const lienzo = $('#lienzo');

zona.addEventListener('click', () => { if (!modoGota) $('#archivoImagen').click(); });
$('#archivoImagen').addEventListener('change', (e) => { if (e.target.files[0]) cargarImagen(e.target.files[0]); });
['dragenter', 'dragover'].forEach((ev) =>
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('sobre'); }));
['dragleave', 'drop'].forEach((ev) =>
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('sobre'); }));
zona.addEventListener('drop', (e) => {
  const f = [...(e.dataTransfer.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) cargarImagen(f);
});
document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) { cargarImagen(item.getAsFile()); irA('impresion'); }
});

function cargarImagen(archivo) {
  const lector = new FileReader();
  lector.onload = () => {
    imagenDataUrl = lector.result;
    const img = new Image();
    img.onload = () => {
      imgOriginal = img;
      const maxAncho = 560;
      const escala = Math.min(1, maxAncho / img.width);
      lienzo.width = img.width * escala;
      lienzo.height = img.height * escala;
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      $('#dropVacio').classList.add('oculto');
      $('#dropPreview').classList.remove('oculto');
      $('#btnOcr').disabled = false;
      $('#btnQuitarImagen').disabled = false;
      $('#notaCuenta').textContent = 'Clic en 🎨 de una fila y después en el color de la imagen para asignar el carrete.';
    };
    img.src = imagenDataUrl;
  };
  lector.readAsDataURL(archivo);
}

$('#btnQuitarImagen').addEventListener('click', (e) => {
  e.stopPropagation();
  imagenDataUrl = null; imgOriginal = null; modoGota = null;
  $('#archivoImagen').value = '';
  $('#dropVacio').classList.remove('oculto');
  $('#dropPreview').classList.add('oculto');
  $('#btnOcr').disabled = true;
  $('#btnQuitarImagen').disabled = true;
  $('#estadoOcr').textContent = '';
  zona.classList.remove('cuentagotas');
  renderFilas();
});

/* --------- cuentagotas --------- */
lienzo.addEventListener('click', (e) => {
  if (!modoGota) return;
  e.stopPropagation();
  const r = lienzo.getBoundingClientRect();
  const x = Math.round(((e.clientX - r.left) / r.width) * lienzo.width);
  const y = Math.round(((e.clientY - r.top) / r.height) * lienzo.height);
  const d = lienzo.getContext('2d').getImageData(x, y, 1, 1).data;
  const hex = rgbAHex(d[0], d[1], d[2]);
  const f = filas.find((x) => x.uid === modoGota);
  if (f) {
    f.colorHex = hex;
    const m = carreteMasParecido(hex);
    if (m) { f.carreteId = m.id; toast(`Color ${hex} → ${nombreCarrete(m)}`, 'ok'); }
    else toast(`Color ${hex} tomado (sin carrete parecido).`);
  }
  modoGota = null;
  zona.classList.remove('cuentagotas');
  renderFilas();
});

const rgbAHex = (r, g_, b) => '#' + [r, g_, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const hexARgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function carreteMasParecido(hex) {
  const [r, gg, b] = hexARgb(hex);
  let mejor = null, mejorD = Infinity;
  for (const c of estado.carretes.filter((x) => !x.archivado)) {
    const [r2, g2, b2] = hexARgb(c.colorHex);
    const d = Math.hypot(r - r2, gg - g2, b - b2);
    if (d < mejorD) { mejorD = d; mejor = c; }
  }
  return mejorD < 110 ? mejor : null;
}

/* ---------------------------------------------------------------- OCR */

$('#btnOcr').addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!imgOriginal) return;
  if (typeof Tesseract === 'undefined')
    return toast('El lector de imágenes necesita conexión a internet la primera vez. Cargá los gramos a mano.', 'err');

  const btn = e.currentTarget;
  btn.disabled = true;
  $('#estadoOcr').textContent = 'Leyendo la imagen… (la primera vez descarga el motor, puede tardar)';

  try {
    const { lienzo: prep, escala } = preprocesar(imgOriginal);
    const { data } = await Tesseract.recognize(prep, 'spa+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text')
          $('#estadoOcr').textContent = `Leyendo la imagen… ${Math.round(m.progress * 100)}%`;
      },
    });
    const detectadas = parsearGramos(data, escala);
    if (!detectadas.length) {
      $('#estadoOcr').textContent = 'No pude leer los gramos automáticamente. Cargalos a mano (es rápido).';
      toast('No se detectaron valores en gramos.', 'err');
    } else {
      filas = [];
      for (const d of detectadas) {
        const m = d.colorHex ? carreteMasParecido(d.colorHex) : null;
        agregarFila({ gramos: d.gramos, colorHex: d.colorHex, carreteId: m ? m.id : '' });
      }
      const asignadas = filas.filter((f) => f.carreteId).length;
      $('#estadoOcr').textContent =
        `Detecté ${detectadas.length} filamento(s). ${asignadas} asignado(s) por color automáticamente. Revisá los valores antes de descontar.`;
      toast(`${detectadas.length} filamentos detectados.`, 'ok');
    }
  } catch (err) {
    console.error(err);
    $('#estadoOcr').textContent = 'Falló la lectura automática. Cargá los gramos a mano.';
  } finally {
    btn.disabled = false;
  }
});

/** Agranda, pasa a gris e invierte (la tabla de Bambu es texto claro sobre fondo oscuro). */
function preprocesar(img) {
  const escala = Math.min(3, Math.max(2, 1400 / img.width));
  const c = document.createElement('canvas');
  c.width = img.width * escala;
  c.height = img.height * escala;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  let suma = 0;
  for (let i = 0; i < p.length; i += 4) suma += (p[i] + p[i + 1] + p[i + 2]) / 3;
  const medio = suma / (p.length / 4);
  const invertir = medio < 128;
  for (let i = 0; i < p.length; i += 4) {
    let v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    if (invertir) v = 255 - v;
    v = Math.max(0, Math.min(255, (v - 128) * 1.7 + 128));
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return { lienzo: c, escala };
}

/** Convierte un token OCR a número tolerando la "g" pegada (0,249 -> 0,24 / 7350 -> 7,35). */
function valorToken(txt) {
  const limpio = String(txt).replace(/[^0-9.,]/g, '');
  const conComa = limpio.match(/^(\d{1,4})[.,](\d{1,2})/);
  if (conComa) return Number(conComa[1] + '.' + conComa[2]);
  const d = limpio.replace(/[^0-9]/g, '');
  if (d.length === 3) return Number(d[0] + '.' + d.slice(1));       // "029" -> 0,29
  if (d.length === 4) return Number(d[0] + '.' + d.slice(1, 3));    // "2719" -> 2,71 (el último es la g)
  return null;
}

/**
 * De la tabla "Resultado del corte" toma, por cada filamento, el valor de la
 * columna Total en gramos. Usa la posición de las columnas, no el orden del texto,
 * y descarta la fila de totales generales.
 */
function parsearGramos(data, escala) {
  const lineas = (data.lines || []).map((l) => {
    const texto = (l.text || '').replace(/\s+/g, ' ').trim();
    const palabras = (l.words || [])
      .map((w) => ({
        valor: valorToken(w.text),
        xc: ((w.bbox?.x0 ?? 0) + (w.bbox?.x1 ?? 0)) / 2 / escala,
      }))
      .filter((w) => w.valor !== null);
    return {
      texto,
      palabras,
      y: ((l.bbox?.y0 ?? 0) + (l.bbox?.y1 ?? 0)) / 2 / escala,
      // una fila de metros trae varias "m" como unidad
      esMetros: (texto.match(/\d\s?m\b/gi) || []).length >= 2,
    };
  });

  const anchoImg = imgOriginal ? imgOriginal.width : 448;
  const tolerancia = anchoImg * 0.09;

  const filasGramos = [];
  lineas.forEach((l, i) => {
    if (l.esMetros || l.palabras.length < 3) return;
    if (/tiempo|coste|cambio|estimad/i.test(l.texto)) return;
    const previa = lineas[i - 1];
    filasGramos.push({
      palabras: l.palabras,
      y: l.y,
      yColor: previa && previa.esMetros ? previa.y : l.y - 14,
      esTotalGeneral: /^total/i.test(l.texto) || !!(previa && /^total/i.test(previa.texto)),
    });
  });
  if (!filasGramos.length) return [];

  // columna "Total" = la más a la derecha de toda la tabla
  const xTotal = Math.max(...filasGramos.map((f) => Math.max(...f.palabras.map((p) => p.xc))));

  const filas = filasGramos.map((f) => {
    let elegida = null;
    for (const p of f.palabras)
      if (Math.abs(p.xc - xTotal) <= tolerancia && (!elegida || p.xc > elegida.xc)) elegida = p;
    const suma = f.palabras.filter((p) => p !== elegida).reduce((a, p) => a + p.valor, 0);
    return { ...f, gramos: elegida ? elegida.valor : Math.round(suma * 100) / 100 };
  });

  // la última fila suele ser el total general: si equivale a la suma de las anteriores, se descarta
  const ultima = filas[filas.length - 1];
  const sumaPrevias = filas.slice(0, -1).reduce((a, f) => a + f.gramos, 0);
  if (filas.length > 1 && (ultima.esTotalGeneral || Math.abs(sumaPrevias - ultima.gramos) <= Math.max(0.5, ultima.gramos * 0.04)))
    filas.pop();

  return filas
    .filter((f) => f.gramos > 0)
    .map((f) => ({ gramos: f.gramos, colorHex: colorDeFila(f.yColor) }));
}

/** Busca el cuadradito de color del filamento, en el extremo izquierdo de la fila. */
function colorDeFila(y) {
  if (!imgOriginal) return null;
  const c = document.createElement('canvas');
  c.width = imgOriginal.width;
  c.height = imgOriginal.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(imgOriginal, 0, 0);

  const ancho = Math.max(10, Math.round(c.width * 0.07));
  const yIni = Math.max(0, Math.round(y - 10));
  const yFin = Math.min(c.height, Math.round(y + 10));
  if (yFin - yIni < 4) return null;

  const datos = ctx.getImageData(0, yIni, ancho, yFin - yIni).data;
  const grupos = new Map();
  for (let i = 0; i < datos.length; i += 4) {
    const clave = `${datos[i] >> 4}-${datos[i + 1] >> 4}-${datos[i + 2] >> 4}`;
    const g0 = grupos.get(clave) || { n: 0, r: 0, g: 0, b: 0 };
    grupos.set(clave, { n: g0.n + 1, r: g0.r + datos[i], g: g0.g + datos[i + 1], b: g0.b + datos[i + 2] });
  }
  const ordenados = [...grupos.values()].sort((a, b) => b.n - a.n);
  if (!ordenados.length) return null;
  const fondo = ordenados[0];                       // el color más repetido es el fondo del panel
  const prom = (v) => [v.r / v.n, v.g / v.n, v.b / v.n];
  const [fr, fg, fb] = prom(fondo);

  let mejor = null;
  for (const v of ordenados.slice(1)) {
    const [r, g1, b] = prom(v);
    if (Math.hypot(r - fr, g1 - fg, b - fb) < 45) continue;   // demasiado parecido al fondo
    if (v.n < 15) continue;                                   // ruido / antialiasing de texto
    if (!mejor || v.n > mejor.n) mejor = v;
  }
  if (!mejor) return null;
  const [r, g2, b] = prom(mejor);
  return rgbAHex(Math.round(r), Math.round(g2), Math.round(b));
}

/* ---------------------------------------------------------------- guardar impresión */

$('#btnGuardarImpresion').addEventListener('click', async () => {
  const lineas = filas
    .map((f) => ({
      carreteId: f.carreteId,
      gramos: Number(String(f.gramos).replace(',', '.')) || 0,
      colorHex: f.colorHex,
    }))
    .filter((l) => l.gramos > 0);

  if (!lineas.length) return toast('Cargá al menos un filamento con gramos.', 'err');
  if (lineas.some((l) => !l.carreteId)) return toast('Falta asignar el carrete en alguna fila.', 'err');

  const cuerpo = {
    nombre: $('#impNombre').value,
    fecha: $('#impFecha').value,
    notas: $('#impNotas').value,
    imagen: imagenDataUrl,
    lineas,
  };

  const enviar = async (forzar) => {
    const datos = await api('/impresiones', { method: 'POST', body: { ...cuerpo, forzar } });
    aplicarEstado(datos);
    toast(`Descontados ${g(datos.impresion.totalGramos)} del stock.`, 'ok');
    limpiarImpresion();
    irA('panel');
  };

  try {
    await enviar(false);
  } catch (err) {
    if (err.status === 409 && err.datos?.requiereConfirmacion) {
      if (confirm(err.message + '\n\n¿Descontar igual? El carrete quedará en 0.')) {
        try { await enviar(true); } catch (e2) { toast(e2.message, 'err'); }
      }
    } else toast(err.message, 'err');
  }
});

function limpiarImpresion() {
  filas = [];
  agregarFila();
  $('#impNombre').value = '';
  $('#impNotas').value = '';
  $('#impFecha').value = new Date().toISOString().slice(0, 10);
  $('#estadoOcr').textContent = '';
  imagenDataUrl = null; imgOriginal = null; modoGota = null;
  $('#archivoImagen').value = '';
  $('#dropVacio').classList.remove('oculto');
  $('#dropPreview').classList.add('oculto');
  $('#btnOcr').disabled = true;
  $('#btnQuitarImagen').disabled = true;
  zona.classList.remove('cuentagotas');
}
$('#btnLimpiarImpresion').addEventListener('click', limpiarImpresion);

/* ---------------------------------------------------------------- arranque */

(async () => {
  try {
    const r = await api('/me');
    entrar(r.usuario);
  } catch {
    $('#pantallaLogin').classList.remove('oculto');
  }
})();
