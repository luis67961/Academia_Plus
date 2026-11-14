/* =====================================================================
   PLUSTWENTY · app.js
   Núcleo compartido del sistema:
   - Acceso a datos mediante la API REST de Spring Boot (MySQL) con caché en memoria
   - Autenticación con sesión del servidor y control de roles
   - Reglas financieras (saldo = exigible - (abonos aprobados + descuentos))
   - Auditoría y notificaciones
   - Utilidades de UI: toasts, confirmaciones, modales, tablas, router SPA
   ===================================================================== */
(function (global) {
  'use strict';

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const ACADEMIA = {
    nombre: 'Academia Preuniversitaria PLUSTWENTY',
    ruc: '20605478912',
    direccion: 'Av. Universitaria 1801, San Miguel · Lima',
    telefono: '(01) 480-2020',
    yape: '987 654 321',
    plin: '912 345 678',
    titular: 'PLUSTWENTY S.A.C.'
  };

  /* ------------------------------------------------------------------
     Utilidades generales
     ------------------------------------------------------------------ */
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = v => {
    if (!v) return null;
    if (v instanceof Date) return new Date(v.getTime());
    return String(v).length === 10 ? new Date(v + 'T00:00:00') : new Date(v);
  };
  const today = () => toISO(new Date());
  const nowISO = () => new Date().toISOString();
  const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return toISO(d); };
  const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const sum = (arr, fn = x => x) => round2(arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0));
  const moneyFmt = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
  const money = n => moneyFmt.format(Number(n) || 0);
  const fmtDate = v => {
    const d = parseDate(v);
    return d && !isNaN(d) ? d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  };
  const fmtDateTime = v => {
    const d = parseDate(v);
    return d && !isNaN(d) ? d.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  };
  const timeAgo = v => {
    const d = parseDate(v);
    if (!d) return '';
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 0) return fmtDate(v);
    if (s < 60) return 'hace un momento';
    const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
    const dd = Math.floor(h / 24); if (dd < 30) return `hace ${dd} día${dd > 1 ? 's' : ''}`;
    return fmtDate(v);
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = name => (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const randomPassword = (len = 8) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  // Límites de coherencia usados por validadores y formularios (una sola fuente de verdad).
  const RULES = {
    edadMin: 12, edadMax: 70, diasPagoAtras: 30,
    // Mora (recargo por pago atrasado). Se calcula sola, sin guardarse: depende de los días de atraso.
    //   mora = saldo pendiente × tasaDiaria × (días de atraso − días de gracia)
    //   Según indicación del profesor: 1 % por cada día de atraso, desde el día siguiente al vencimiento.
    //   diasGracia: 0 = sin días de gracia.
    //   topePct: la mora nunca supera ese % del importe de la cuota (0.20 = 20 %). null = sin tope.
    mora: { activa: true, diasGracia: 0, tasaDiaria: 0.01, topePct: 0.20 },
    // Ciclos académicos: un ciclo se crea ANTES de empezar, dura entre 2 semanas y 12 meses y su fin cubre la última pensión.
    // Descuentos por cuota: desactivados (la academia no los otorga). Con false se ignora cualquier descuento guardado.
    descuentos: false,
    ciclo: { mesesAnticipacionMax: 18, duracionMinDias: 14, duracionMaxDias: 366 }
  };
  const fechaHaceAnios = n => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return toISO(d); };

  const validators = {
    dni: v => /^\d{8}$/.test(String(v || '').trim()) && !/^(\d)\1{7}$/.test(String(v || '').trim()),
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()),
    // Celular peruano: 9 dígitos que empiezan con 9.
    phone: v => /^9\d{8}$/.test(String(v || '').replace(/\s/g, '')),
    username: v => /^[a-z0-9._]{3,24}$/.test(String(v || '')),
    operacion: v => /^\d{6}$/.test(String(v || '').trim()),
    // Fecha de nacimiento: válida, en el pasado (ni hoy ni futura) y con edad entre RULES.edadMin y RULES.edadMax años.
    birthdate: v => {
      const d = parseDate(v);
      if (!d || isNaN(d)) return false;
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      if (d >= hoy) return false;
      let edad = hoy.getFullYear() - d.getFullYear();
      const m = hoy.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) edad--;
      return edad >= RULES.edadMin && edad <= RULES.edadMax;
    }
  };

  /* ------------------------------------------------------------------
     Acceso a datos: API REST (Spring Boot + MySQL) con caché en memoria
     ------------------------------------------------------------------ */
  class ApiError extends Error {
    constructor(message, status) { super(message); this.name = 'ApiError'; this.status = status || 0; }
  }

  // Todas las llamadas son síncronas (XHR bloqueante) para conservar tal cual la
  // lógica de las vistas, que lee y escribe datos de forma inmediata.
  const http = {
    async callAsync(method, url, body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(url, {
          method, credentials: 'same-origin', signal: controller.signal,
          headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
        const data = await response.json().catch(() => null);
        return { status: response.status, ok: response.ok, data };
      } catch (e) {
        throw new ApiError(e.name === 'AbortError'
          ? 'El servidor está tardando demasiado. Espera un momento e intenta nuevamente.'
          : 'No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.', 0);
      } finally { clearTimeout(timer); }
    },
    call(method, url, body) {
      const x = new XMLHttpRequest();
      x.open(method, url, false);
      x.setRequestHeader('Accept', 'application/json');
      if (body !== undefined) x.setRequestHeader('Content-Type', 'application/json');
      try { x.send(body === undefined ? null : JSON.stringify(body)); }
      catch (e) { throw new ApiError('No se pudo conectar con el servidor. Verifique que la aplicación esté en ejecución.', 0); }
      if (x.status === 0) throw new ApiError('No se pudo conectar con el servidor. Verifique que la aplicación esté en ejecución.', 0);
      let data = null;
      try { data = x.responseText ? JSON.parse(x.responseText) : null; } catch (e) { data = null; }
      return { status: x.status, ok: x.status >= 200 && x.status < 300, data };
    },
    must(method, url, body, fallback) {
      const r = this.call(method, url, body);
      if (!r.ok) throw new ApiError((r.data && (r.data.message || r.data.error)) || fallback || 'No se pudo completar la operación.', r.status);
      return r.data;
    }
  };
// Si el navegador restaura la página desde su memoria (atrás/adelante), se recarga
  // para que el servidor vuelva a validar la sesión.
  window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
  const COLECCIONES = ['programas', 'ciclos', 'estudiantes', 'users', 'matriculas', 'pensiones', 'pagos', 'notificaciones', 'auditoria'];
  const cache = {};
  let ME = null; // usuario autenticado (sesión del servidor)
  let UNREAD = 0; // nº de notificaciones no leídas (COUNT del servidor; no se bajan todas)

  /** Carga desde el servidor los datos que el usuario actual tiene permitido ver. */
  function hydrate() {
    let r;
    try { r = http.call('GET', '/api/bootstrap'); } catch (e) { r = { ok: false, data: null }; }
    const d = r.ok && r.data ? r.data : { me: null, data: {} };
    ME = d.me || null;
    UNREAD = d.unreadCount || 0;
    COLECCIONES.forEach(c => { cache[c] = (d.data && d.data[c]) || []; });
    return r.ok;
  }

  const db = {
    all(col) { return cache[col] || (cache[col] = []); },
    find(col, id) { return this.all(col).find(x => x.id === id) || null; },
    where(col, fn) { return this.all(col).filter(fn); },
    insert(col, obj, prefix) {
      const item = { id: obj.id || uid(prefix || col.slice(0, 3)), ...obj };
      const saved = http.must('POST', `/api/data/${col}`, item, 'No se pudo guardar el registro.');
      cache[col] = this.all(col).concat([saved]);
      return saved;
    },
    insertMany(col, items) {
      if (!items.length) return [];
      const saved = http.must('POST', `/api/data/${col}/batch`, items, 'No se pudieron guardar los registros.');
      cache[col] = this.all(col).concat(saved);
      return saved;
    },
    update(col, id, patch) {
      const arr = this.all(col).slice();
      const i = arr.findIndex(x => x.id === id);
      if (i < 0) return null;
      const saved = http.must('PATCH', `/api/data/${col}/${encodeURIComponent(id)}`, patch, 'No se pudo actualizar el registro.');
      arr[i] = saved;
      cache[col] = arr;
      return saved;
    },
    reload: hydrate,
    clearCache: hydrate
  };

  /* Notificaciones: el badge usa un COUNT y la lista se pide paginada (nunca se bajan todas). */
  const notificaciones = {
    count() {
      const r = http.call('GET', '/api/notificaciones/unread-count');
      if (r.ok && r.data) UNREAD = r.data.count || 0;
      return UNREAD;
    },
    cachedCount() { return UNREAD; },
    list(page = 0, size = 20) {
      const r = http.call('GET', `/api/notificaciones?page=${page}&size=${size}`);
      return r.ok && Array.isArray(r.data) ? r.data : [];
    },
    marcarLeida(id) {
      http.must('PATCH', `/api/data/notificaciones/${encodeURIComponent(id)}`, { leida: true }, 'No se pudo marcar la notificación.');
      return this.count();
    },
    marcarTodas() {
      http.must('POST', '/api/notificaciones/mark-all-read', {}, 'No se pudieron marcar las notificaciones.');
      return this.count();
    }
  };

  /* Revisión de pagos: una sola llamada transaccional (aprobar/rechazar) en vez de 4-5. */
  function guardarPagoEnCache(saved) {
    const arr = db.all('pagos').slice();
    const i = arr.findIndex(x => x.id === saved.id);
    if (i >= 0) arr[i] = saved; else arr.push(saved);
    cache.pagos = arr;
    return saved;
  }
  const revisionPagos = {
    aprobar(id) {
      return guardarPagoEnCache(http.must('POST', `/api/pagos/${encodeURIComponent(id)}/aprobar`, {}, 'No se pudo aprobar el pago.'));
    },
    rechazar(id, motivo) {
      return guardarPagoEnCache(http.must('POST', `/api/pagos/${encodeURIComponent(id)}/rechazar`, { motivo }, 'No se pudo rechazar el pago.'));
    },
    registrarCaja(datos) {
      return guardarPagoEnCache(http.must('POST', '/api/pagos/registrar-caja', datos, 'No se pudo registrar el pago en caja.'));
    }
  };

  /* Registro de matrícula: una sola llamada; luego refresca la caché (cambiaron varias colecciones). */
  const registroMatriculas = {
    registrar(datos) {
      const saved = http.must('POST', '/api/matriculas/registrar', datos, 'No se pudo registrar la matrícula.');
      hydrate();
      return saved;
    }
  };

  /* Registro de estudiante: una sola llamada (crea ficha + cuenta); luego refresca la caché. */
  const registroEstudiantes = {
    registrar(datos) {
      const saved = http.must('POST', '/api/estudiantes/registrar', datos, 'No se pudo registrar el estudiante.');
      hydrate();
      return saved;
    }
  };

  const nextCounter = name =>
    http.must('POST', `/api/counters/${encodeURIComponent(name)}/next`, undefined, 'No se pudo generar el correlativo.').value;

  /* ------------------------------------------------------------------
     Comprobante simulado (SVG) para los datos semilla
     ------------------------------------------------------------------ */
  function fakeVoucher(metodo, monto, op, fecha, nombre) {
    const color = metodo === 'Yape' ? '#742284' : metodo === 'Plin' ? '#00A9B5' : '#1E3A8A';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="560" viewBox="0 0 360 560">
<rect width="360" height="560" rx="26" fill="#ffffff"/>
<path d="M0 26A26 26 0 0 1 26 0h308a26 26 0 0 1 26 26v150H0z" fill="${color}"/>
<text x="180" y="72" font-family="Arial,Helvetica" font-size="36" font-weight="700" fill="#fff" text-anchor="middle">${esc(metodo)}</text>
<text x="180" y="108" font-family="Arial,Helvetica" font-size="15" fill="#fff" fill-opacity=".85" text-anchor="middle">¡Pago realizado con éxito!</text>
<circle cx="180" cy="176" r="36" fill="#10B981" stroke="#fff" stroke-width="6"/>
<path d="M163 177l12 12 22-24" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="180" y="270" font-family="Arial,Helvetica" font-size="42" font-weight="700" fill="#0F172A" text-anchor="middle">S/ ${Number(monto).toFixed(2)}</text>
<text x="180" y="300" font-family="Arial,Helvetica" font-size="14" fill="#64748B" text-anchor="middle">Destino: ${esc(ACADEMIA.titular)}</text>
<line x1="30" y1="330" x2="330" y2="330" stroke="#E2E8F0" stroke-dasharray="6 6"/>
<text x="30" y="368" font-family="Arial,Helvetica" font-size="14" fill="#64748B">Nº de operación</text>
<text x="330" y="368" font-family="Arial,Helvetica" font-size="14" font-weight="700" fill="#0F172A" text-anchor="end">${esc(op)}</text>
<text x="30" y="404" font-family="Arial,Helvetica" font-size="14" fill="#64748B">Fecha</text>
<text x="330" y="404" font-family="Arial,Helvetica" font-size="14" font-weight="700" fill="#0F172A" text-anchor="end">${esc(fecha)}</text>
<text x="30" y="440" font-family="Arial,Helvetica" font-size="14" fill="#64748B">Enviado por</text>
<text x="330" y="440" font-family="Arial,Helvetica" font-size="14" font-weight="700" fill="#0F172A" text-anchor="end">${esc(nombre)}</text>
<rect x="30" y="476" width="300" height="50" rx="14" fill="#F1F5F9"/>
<text x="180" y="507" font-family="Arial,Helvetica" font-size="13" fill="#475569" text-anchor="middle">Constancia digital · Comprobante simulado</text>
</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ------------------------------------------------------------------
     Reglas financieras
     ------------------------------------------------------------------ */
  const finance = {
    /** Información calculada de una obligación (pensión / matrícula). */
    info(p, pagosAll) {
      const pagos = (pagosAll || db.all('pagos')).filter(x => x.pensionId === p.id);
      const abonado = sum(pagos.filter(x => x.estado === 'Aprobado'), x => x.monto);
      const enRevision = sum(pagos.filter(x => x.estado === 'Pendiente'), x => x.monto);
      const descuento = RULES.descuentos ? round2(p.descuento || 0) : 0;   // los descuentos están desactivados (RULES.descuentos)
      const exigible = round2(Math.max(0, p.importe - descuento));
      // Saldo pendiente = Importe exigible - (Abonos aprobados + Descuentos)
      const saldo = round2(Math.max(0, p.importe - (abonado + descuento)));
      let estado;
      if (p.anulada) estado = 'Anulada';
      else if (saldo <= 0) estado = 'Pagada';
      else if (p.fechaVencimiento < today()) estado = 'Vencida';
      else if (abonado > 0) estado = 'Parcial';
      else estado = 'Pendiente';
      const diasAtraso = estado === 'Vencida' ? daysBetween(p.fechaVencimiento, today()) : 0;
      const base = { ...p, abonado, enRevision, descuento, exigible, saldo, estado, diasAtraso, nPagos: pagos.length };
      // Mora: si el estudiante ya reportó el pago completo (en revisión), la mora queda fijada en lo que declaró.
      let mora = 0, moraFija = false;
      if (estado === 'Vencida') {
        if (enRevision >= saldo && enRevision > 0) { mora = round2(Math.max(0, enRevision - saldo)); moraFija = true; }
        else mora = finance.moraA(base, today());
      }
      const moraCobrada = round2(Math.max(0, abonado - exigible));      // lo pagado por encima de la cuota = mora ya cobrada
      const disponible = p.anulada ? 0 : round2(Math.max(0, saldo + mora - enRevision));
      return { ...base, mora, moraFija, moraCobrada, totalPagar: round2(saldo + mora), disponible };
    },
    /** Mora de una obligación calculada a una fecha (la del pago): saldo × tasa diaria × días con mora, con tope. */
    moraA(inf, fecha) {
      const R = RULES.mora;
      if (!R.activa || inf.anulada || !(inf.saldo > 0) || !fecha || fecha <= inf.fechaVencimiento) return 0;
      const dias = Math.max(0, daysBetween(inf.fechaVencimiento, fecha) - R.diasGracia);
      const bruta = inf.saldo * R.tasaDiaria * dias;
      return round2(R.topePct == null ? bruta : Math.min(bruta, inf.exigible * R.topePct));
    },
    /** Desglose del cálculo (para mostrarlo en pantalla). */
    moraDetalle(inf, fecha) {
      const R = RULES.mora;
      const f = fecha || today();
      const diasAtraso = Math.max(0, daysBetween(inf.fechaVencimiento, f));
      const diasMora = Math.max(0, diasAtraso - R.diasGracia);
      const bruta = round2(inf.saldo * R.tasaDiaria * diasMora);
      const hayTope = R.topePct != null;
      const tope = hayTope ? round2(inf.exigible * R.topePct) : null;
      return { fecha: f, diasAtraso, diasGracia: R.diasGracia, diasMora, tasa: R.tasaDiaria, topePct: R.topePct, bruta, tope, topeAplicado: hayTope && bruta > tope, mora: finance.moraA(inf, f) };
    },
    /** Monto a pagar si el pago se realiza en `fecha` (saldo + mora a esa fecha − lo ya reportado en revisión). */
    disponibleA(inf, fecha) {
      if (inf.anulada) return 0;
      const mora = (inf.moraFija ? inf.mora : finance.moraA(inf, fecha));
      return round2(Math.max(0, inf.saldo + mora - inf.enRevision));
    },
    pensionesDe(estId, pagosAll) {
      const pagos = pagosAll || db.all('pagos');
      return db.where('pensiones', p => p.estudianteId === estId)
        .map(p => finance.info(p, pagos))
        .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento) || (a.numeroCuota || 0) - (b.numeroCuota || 0));
    },
    /**
     * Orden de pago: en cada matrícula solo se puede pagar la cuota MÁS ANTIGUA que aún tenga saldo
     * disponible (no cancelada ni ya reportada en revisión). Las siguientes quedan bloqueadas hasta entonces.
     * Devuelve { ids: Set de cuotas habilitadas, primera: cuota más antigua habilitada }.
     */
    habilitadas(estId, pagosAll) {
      // En cada matrícula se paga primero el cargo de MATRÍCULA y luego las pensiones por orden de vencimiento.
      const elegida = new Map();
      const orden = finance.pensionesDe(estId, pagosAll).filter(p => !p.anulada && p.disponible > 0);
      orden.forEach(p => {
        const k = p.matriculaId || p.cicloId || 'sin-matricula';
        const actual = elegida.get(k);
        if (!actual || (p.tipo === 'Matrícula' && actual.tipo !== 'Matrícula')) elegida.set(k, p);
      });
      const ids = new Set([...elegida.values()].map(p => p.id));
      const primera = orden.find(p => ids.has(p.id)) || null;
      return { ids, primera };
    },
    resumen(estId) {
      const pagosAll = db.all('pagos');
      const pens = finance.pensionesDe(estId, pagosAll).filter(p => !p.anulada);
      const pagos = pagosAll.filter(p => p.estudianteId === estId);
      const t = today();
      const mats = db.where('matriculas', m => m.estudianteId === estId).sort((a, b) => b.fecha.localeCompare(a.fecha));
      return {
        pensiones: pens,
        pagos,
        totalPagado: sum(pagos.filter(p => p.estado === 'Aprobado'), p => p.monto),
        enRevision: sum(pagos.filter(p => p.estado === 'Pendiente'), p => p.monto),
        exigible: sum(pens, p => p.exigible),
        saldo: sum(pens, p => p.saldo),
        mora: sum(pens, p => p.mora),
        saldoTotal: sum(pens, p => p.saldo + p.mora),
        vencidas: pens.filter(p => p.estado === 'Vencida'),
        montoVencido: sum(pens.filter(p => p.estado === 'Vencida'), p => p.saldo + p.mora),
        proximo: pens.filter(p => p.saldo > 0 && p.fechaVencimiento >= t)[0] || null,
        cuotasPagadas: pens.filter(p => p.estado === 'Pagada').length,
        cuotasTotal: pens.length,
        matriculaActiva: mats.find(m => m.estado === 'Activa') || null,
        matriculas: mats
      };
    },
    /** Genera las obligaciones de una matrícula: concepto matrícula + cronograma de pensiones. */
    generarObligaciones(mat, ciclo, opts = {}) {
      const out = [];
      const start = parseDate(ciclo.fechaInicio);
      const base = { matriculaId: mat.id, estudianteId: mat.estudianteId, cicloId: ciclo.id, descuento: 0, motivoDescuento: '', fechaCreacion: nowISO(), anulada: false };
      if (opts.matricula !== false) {
        const venc = mat.fecha > ciclo.fechaInicio ? addDays(mat.fecha, 3) : ciclo.fechaInicio;
        out.push({ id: uid('pen'), ...base, tipo: 'Matrícula', concepto: `Matrícula ${ciclo.nombre}`, numeroCuota: 0, importe: round2(mat.montoMatricula ?? ciclo.matricula), fechaVencimiento: venc });
      }
      if (opts.pensiones !== false) {
        const cuotas = Number(opts.cuotas || ciclo.cuotas);
        const dia = Math.min(28, Math.max(1, Number(opts.dia || 15)));
        const importe = round2(opts.importe ?? ciclo.pension);
        for (let i = 0; i < cuotas; i++) {
          const d = new Date(start.getFullYear(), start.getMonth() + i, dia);
          out.push({ id: uid('pen'), ...base, tipo: 'Pensión', concepto: `Pensión ${i + 1}/${cuotas} · ${MESES[d.getMonth()]}`, numeroCuota: i + 1, importe, fechaVencimiento: toISO(d) });
        }
      }
      return out;
    },
    nuevoRecibo: () => 'R-' + pad(nextCounter('recibo'), 6)
  };

  /* ------------------------------------------------------------------
     Datos de demostración (los carga el servidor desde seed/seed.json)
     ------------------------------------------------------------------ */
  function resetDemo() {
    http.must('POST', '/api/demo/reset', undefined, 'No se pudieron restablecer los datos de demostración.');
    hydrate();
  }

  /* ------------------------------------------------------------------
     Autenticación (sesión del servidor) y control de roles
     ------------------------------------------------------------------ */
  const auth = {
    async login(username, password, rolEsperado) {
      let r;
      try { r = await http.callAsync('POST', '/api/auth/login', { username, password, rol: rolEsperado || null }); }
      catch (e) { return { ok: false, error: e.message }; }
      if (r.ok && r.data && r.data.ok) { ME = r.data.user; return { ok: true, user: r.data.user }; }
      return { ok: false, error: (r.data && (r.data.error || r.data.message)) || 'No se pudo iniciar sesión.' };
    },
    changePassword(actual, nueva) {
      let r;
      try { r = http.call('POST', '/api/auth/change-password', { actual, nueva }); }
      catch (e) { return { ok: false, error: e.message }; }
      if (r.ok && r.data && r.data.ok) return { ok: true };
      return { ok: false, error: (r.data && (r.data.error || r.data.message)) || 'No se pudo cambiar la contraseña.' };
    },
    current() { return ME && ME.activo !== false ? ME : null; },
    logout() {
      try { http.call('POST', '/api/auth/logout'); } catch (e) { /* sin conexión: se cierra igual en el cliente */ }
      ME = null;
       location.replace('index.html');
    },
    silentLogout() {
      try { http.call('POST', '/api/auth/logout'); } catch (e) { /* sin conexión */ }
      ME = null;
    },
    home: u => (u.rol === 'admin' ? 'admin.html' : 'usuario.html'),
    require(rol) {
      const u = this.current();
      if (!u) { location.replace('index.html'); return null; }
      if (u.rol !== rol) { location.replace(this.home(u)); return null; }
      return u;
    }
  };

  /* ------------------------------------------------------------------
     Auditoría y notificaciones
     ------------------------------------------------------------------ */
  function audit(accion, modulo, motivo = '') {
    const u = auth.current();
    db.insert('auditoria', { fecha: nowISO(), adminId: u?.id || null, admin: u?.nombre || 'Sistema', accion, modulo, motivo }, 'aud');
  }
  function notify(userId, { titulo, mensaje, tipo = 'info', link = '', ref = '' }) {
    return db.insert('notificaciones', { userId, titulo, mensaje, tipo, fecha: nowISO(), leida: false, link, ref }, 'ntf');
  }
  function notifyEstudiante(estudianteId, payload) {
    db.where('users', u => u.rol === 'user' && u.estudianteId === estudianteId).forEach(u => notify(u.id, payload));
  }

  /* ------------------------------------------------------------------
     UI: toasts, diálogos, modales, componentes
     ------------------------------------------------------------------ */
  const SWAL_CLASSES = { popup: 'pt-swal', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-secondary', denyButton: 'btn btn-danger', actions: 'pt-swal-actions' };
  const BADGES = {
    Activa: ['success', 'fa-circle-check'], Activo: ['success', 'fa-circle-check'], Pagada: ['success', 'fa-circle-check'], Aprobado: ['success', 'fa-circle-check'],
    Inactiva: ['neutral', 'fa-circle-minus'], Inactivo: ['neutral', 'fa-circle-minus'], Anulada: ['neutral', 'fa-ban'],
    Pendiente: ['warning', 'fa-clock'], Parcial: ['info', 'fa-circle-half-stroke'], Vencida: ['danger', 'fa-triangle-exclamation'],
    Rechazado: ['danger', 'fa-circle-xmark'], 'En revisión': ['info', 'fa-hourglass-half'],
    Administrador: ['primary', 'fa-user-shield'], Estudiante: ['info', 'fa-user-graduate'], Apoderado: ['violet', 'fa-people-roof']
  };

  const UI = {
    toast(msg, icon = 'success') {
      if (!global.Swal) return alert(msg);
      Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3200, timerProgressBar: true, customClass: { popup: 'pt-toast' } })
        .fire({ icon, title: msg });
    },
    alert(title, text = '', icon = 'info', html) {
      return Swal.fire({ title, text, html, icon, confirmButtonText: 'Entendido', buttonsStyling: false, customClass: SWAL_CLASSES });
    },
    async confirm({ title, text = '', html, icon = 'question', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false }) {
      const r = await Swal.fire({
        title, text, html, icon, showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: cancelText,
        reverseButtons: true, buttonsStyling: false, focusCancel: danger,
        customClass: { ...SWAL_CLASSES, confirmButton: danger ? 'btn btn-danger' : 'btn btn-primary' }
      });
      return r.isConfirmed;
    },
    /** Diálogo con motivo obligatorio (y checkbox opcional). Devuelve {motivo, checked} o null. */
    async reason({ title, text = '', placeholder = 'Describa el motivo…', confirmText = 'Confirmar', danger = false, icon = 'warning', checkbox = null }) {
      const r = await Swal.fire({
        title, icon,
        html: `${text ? `<p class="swal-text">${text}</p>` : ''}<textarea id="sw-reason" class="textarea" rows="3" placeholder="${esc(placeholder)}"></textarea>
               ${checkbox ? `<label class="check mt-3" style="justify-content:flex-start;text-align:left"><input type="checkbox" id="sw-check" ${checkbox.checked ? 'checked' : ''}><span>${checkbox.label}</span></label>` : ''}`,
        showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: 'Cancelar', reverseButtons: true,
        buttonsStyling: false, focusConfirm: false,
        customClass: { ...SWAL_CLASSES, confirmButton: danger ? 'btn btn-danger' : 'btn btn-primary' },
        didOpen: () => document.getElementById('sw-reason').focus(),
        preConfirm: () => {
          const v = document.getElementById('sw-reason').value.trim();
          if (v.length < 5) { Swal.showValidationMessage('Ingrese un motivo válido (mínimo 5 caracteres).'); return false; }
          return { motivo: v, checked: !!document.getElementById('sw-check')?.checked };
        }
      });
      return r.isConfirmed ? r.value : null;
    },
    openModal({ title, subtitle = '', icon = 'fa-pen-to-square', body = '', footer = '', size = 'md' }) {
      UI.closeModal(true);
      const root = document.createElement('div');
      root.id = 'pt-modal';
      root.className = 'modal-overlay';
      root.innerHTML = `
        <div class="modal-panel modal-${size}" role="dialog" aria-modal="true" aria-labelledby="pt-modal-title">
          <div class="modal-header">
            <div class="flex items-center gap-3 min-w-0">
              <div class="modal-icon"><i class="fa-solid ${icon}"></i></div>
              <div class="min-w-0"><h3 id="pt-modal-title" class="modal-title">${title}</h3>${subtitle ? `<p class="modal-subtitle truncate">${subtitle}</p>` : ''}</div>
            </div>
            <button class="btn-icon" data-close aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-body">${body}</div>
          ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
        </div>`;
      document.body.appendChild(root);
      document.body.classList.add('modal-open');
      requestAnimationFrame(() => root.classList.add('show'));
      root.addEventListener('mousedown', e => { if (e.target === root) UI.closeModal(); });
      root.addEventListener('click', e => { if (e.target.closest('[data-close]')) UI.closeModal(); });
      setTimeout(() => root.querySelector('.modal-body input:not([type=hidden]):not([readonly]):not([disabled]), .modal-body select:not([disabled])')?.focus(), 80);
      return root;
    },
    closeModal(immediate = false) {
      const m = document.getElementById('pt-modal');
      if (!m) return;
      document.body.classList.remove('modal-open');
      if (immediate) { m.remove(); return; }
      m.classList.remove('show');
      setTimeout(() => m.remove(), 200);
    },
    badge(estado, label) {
      const [t, i] = BADGES[estado] || ['neutral', 'fa-circle'];
      return `<span class="badge badge-${t}"><i class="fa-solid ${i}"></i>${esc(label || estado)}</span>`;
    },
    /** Celda de saldo: total a pagar (con mora) y un ojito que muestra cuánto aumentó por mora. */
    saldoMora(p) {
      const ojo = (id, tip) => `<button type="button" class="mora-eye" data-mora="${id}" title="${tip}" aria-label="${tip}"><i class="fa-solid fa-eye"></i></button>`;
      if (p.mora > 0) {
        return `<div class="saldo-mora"><span class="font-extrabold text-red-600">${money(p.saldo + p.mora)}</span> ${ojo(p.id, 'Ver cuánto aumentó por mora')}<p class="mora-tag">incl. mora ${money(p.mora)}${!p.moraFija && RULES.mora.topePct != null && p.mora >= round2(p.exigible * RULES.mora.topePct) ? ' (tope)' : ''}</p></div>`;
      }
      if (p.saldo > 0 && p.estado === 'Vencida' && RULES.mora.activa && !p.moraFija) {
        return `<div class="saldo-mora"><span class="font-extrabold text-red-600">${money(p.saldo)}</span> ${ojo(p.id, 'Ver estado de la mora')}<p class="mora-tag mora-gracia">en días de gracia</p></div>`;
      }
      if (p.moraCobrada > 0) {
        return `<div class="saldo-mora"><span class="font-extrabold text-slate-400">${money(p.saldo)}</span> ${ojo(p.id, 'Ver mora pagada')}<p class="mora-tag mora-pagada">mora pagada ${money(p.moraCobrada)}</p></div>`;
      }
      return `<span class="font-extrabold ${p.saldo > 0 ? 'text-red-600' : 'text-slate-400'}">${money(p.saldo)}</span>`;
    },
    /** Ventana con el detalle del cálculo de mora de una obligación. */
    moraDetalle(penId, fecha) {
      const pen = db.find('pensiones', penId);
      if (!pen) return;
      const inf = finance.info(pen, db.all('pagos'));
      const R = RULES.mora;
      const d = finance.moraDetalle(inf, fecha);
      const pct = x => (x * 100).toLocaleString('es-PE', { maximumFractionDigits: 2 }) + ' %';
      const fila = (a, b, cls = '') => `<tr class="${cls}"><td>${a}</td><td>${b}</td></tr>`;
      let filas = fila('Importe de la cuota', money(inf.importe));
      if (inf.descuento > 0) filas += fila('Descuento', '− ' + money(inf.descuento));
      if (inf.abonado > 0) filas += fila('Abonado (aprobado)', '− ' + money(Math.min(inf.abonado, inf.exigible)));
      filas += fila('Saldo pendiente (sin mora)', money(inf.saldo), 'mora-sub');
      let cierre = '';
      if (inf.moraCobrada > 0 && inf.saldo <= 0) {
        filas += fila('Mora pagada', money(inf.moraCobrada), 'mora-total');
        cierre = '<p class="mora-nota">Esta cuota ya fue cancelada. La mora indicada se cobró junto con el pago.</p>';
      } else if (inf.estado !== 'Vencida') {
        cierre = '<p class="mora-nota">Esta cuota aún no está vencida: no genera mora.</p>';
      } else if (inf.moraFija) {
        filas += fila('Mora incluida en su pago reportado', '+ ' + money(inf.mora), 'mora-total');
        filas += fila('TOTAL REPORTADO (en revisión)', money(inf.saldo + inf.mora), 'mora-grand');
        cierre = '<p class="mora-nota">Su pago ya fue reportado, por eso la mora quedó fijada y no sigue aumentando.</p>';
      } else {
        filas += fila('Venció el', fmtDate(inf.fechaVencimiento));
        filas += fila('Días de atraso', d.diasAtraso + (d.diasAtraso === 1 ? ' día' : ' días'));
        if (d.diasGracia > 0) {
          filas += fila('Días de gracia (sin mora)', '− ' + d.diasGracia);
          filas += fila('Días con mora', d.diasMora + (d.diasMora === 1 ? ' día' : ' días'));
        }
        filas += fila('Tasa de mora', pct(d.tasa) + ' diario sobre el saldo');
        if (d.tope != null) filas += fila(`Tope máximo (${pct(d.topePct)} de la cuota)`, money(d.tope));
        filas += fila('Mora acumulada', '+ ' + money(d.mora), 'mora-total');
        filas += fila('TOTAL A PAGAR HOY', money(inf.saldo + d.mora), 'mora-grand');
        const diasAlTope = d.tope != null && inf.saldo * d.tasa > 0 ? Math.ceil(d.tope / (inf.saldo * d.tasa)) : null;
        cierre = d.diasMora === 0
          ? `<p class="mora-nota">La cuota está vencida pero todavía en los ${d.diasGracia} días de gracia: <b>aún no se cobra mora</b>. Empezará a correr dentro de ${d.diasGracia - d.diasAtraso + 1} ${d.diasGracia - d.diasAtraso + 1 === 1 ? 'día' : 'días'}.</p>`
          : (d.topeAplicado
              ? `<p class="mora-nota">Se alcanzó el <b>tope máximo</b> de mora (${pct(d.topePct)} de la cuota = ${money(d.tope)}); ya no sigue aumentando.</p>`
              : (diasAlTope ? `<p class="mora-nota">La mora seguirá subiendo ${money(inf.saldo * d.tasa)} por día hasta llegar al tope (a los ${diasAlTope} días de mora).</p>` : ''));
      }
      const como = R.activa ? `
        <details class="mora-como"><summary>¿Cómo se calcula la mora?</summary>
          <p>Si una cuota no se paga a tiempo, ${R.diasGracia > 0 ? `después de <b>${R.diasGracia} días de gracia</b> ` : ''}se suma una mora de <b>${pct(R.tasaDiaria)} del saldo por cada día</b> de atraso${R.topePct != null ? `, hasta un máximo del <b>${pct(R.topePct)} del importe de la cuota</b>` : ''}.</p>
          <p class="mora-ej">Ejemplo: saldo de ${money(100)} con 10 días de atraso → ${money(100 * R.tasaDiaria * Math.max(0, 10 - R.diasGracia))} de mora (total ${money(100 + 100 * R.tasaDiaria * Math.max(0, 10 - R.diasGracia))}).</p>
          <p>La mora se calcula hasta la <b>fecha en que se realizó el pago</b>: quien pagó a tiempo y reporta tarde no paga mora de más.</p>
        </details>` : '';
      return UI.alert('Detalle de mora', inf.concepto, 'info', `<table class="mora-tabla">${filas}</table>${cierre}${como}`);
    },
    method(metodo) {
      const cls = { Yape: 'yape', Plin: 'plin', Efectivo: 'efectivo', Transferencia: 'transfer' }[metodo] || 'transfer';
      const ic = { Yape: 'Y', Plin: 'P', Efectivo: '<i class="fa-solid fa-money-bill-wave"></i>', Transferencia: '<i class="fa-solid fa-building-columns"></i>' }[metodo] || '•';
      return `<span class="method-chip"><span class="method-dot ${cls}">${ic}</span>${esc(metodo)}</span>`;
    },
    empty(msg = 'No hay registros para mostrar.', icon = 'fa-inbox', action = '') {
      return `<div class="empty"><div class="empty-icon"><i class="fa-solid ${icon}"></i></div><p class="font-semibold text-slate-700">${msg}</p>${action ? `<div class="mt-4">${action}</div>` : ''}</div>`;
    },
    kpi({ icon, label, value, hint = '', tone = 'navy' }) {
      return `<div class="kpi kpi-${tone}"><div class="kpi-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="min-w-0 flex-1"><p class="kpi-label">${label}</p><p class="kpi-value">${value}</p>${hint ? `<p class="kpi-hint">${hint}</p>` : ''}</div></div>`;
    },
    pageHeader(title, desc = '', actions = '') {
      return `<div class="page-head"><div><h2 class="page-title">${title}</h2>${desc ? `<p class="page-desc">${desc}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
    },
    /** Tabla responsive: en móvil se transforma en tarjetas usando data-label. */
    table({ cols, rows, foot = '', cls = '' }) {
      const strip = s => String(s).replace(/<[^>]*>/g, '').trim();
      return `<div class="table-wrap"><table class="table table-responsive ${cls}">
        <thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${c.label}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => {
          const cells = Array.isArray(r) ? r : r.cells;
          return `<tr ${Array.isArray(r) ? '' : (r.attrs || '')}>${cells.map((cell, i) => `<td data-label="${esc(strip(cols[i]?.label || ''))}" class="${cols[i]?.cls || ''}">${cell}</td>`).join('')}</tr>`;
        }).join('')}</tbody>${foot}</table></div>`;
    },
    /** Combobox con búsqueda: reemplaza a un <select> largo (p. ej. elegir estudiante).
        El valor viaja en un <input type="hidden" name="..."> para que FormData siga igual.
        options: [{ value, label, search? }]. Tras inyectar el HTML llamar a UI.initSearchSelect(). */
    searchSelect({ name, id = '', options = [], value = '', placeholder = 'Buscar...', required = false }) {
      const sel = options.find(o => String(o.value) === String(value));
      const items = options.map(o =>
        `<li class="ss-item" role="option" data-value="${esc(o.value)}" data-search="${esc(norm((o.label || '') + ' ' + (o.search || '')))}">${esc(o.label)}</li>`
      ).join('');
      return `<div class="ss" data-ss${required ? ' data-required' : ''}>
        <input type="hidden" name="${esc(name)}"${id ? ` id="${esc(id)}"` : ''} value="${esc(value)}">
        <div class="ss-field">
          <i class="fa-solid fa-magnifying-glass ss-ico"></i>
          <input type="text" class="input ss-input" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list" placeholder="${esc(placeholder)}" value="${sel ? esc(sel.label) : ''}">
          <i class="fa-solid fa-chevron-down ss-caret"></i>
        </div>
        <ul class="ss-menu" role="listbox" hidden>${items}</ul>
      </div>`;
    },
    initSearchSelect(scope) {
      (scope || document).querySelectorAll('[data-ss]').forEach(ss => {
        if (ss.dataset.ready) return;
        ss.dataset.ready = '1';
        const hidden = ss.querySelector('input[type=hidden]');
        const input = ss.querySelector('.ss-input');
        const menu = ss.querySelector('.ss-menu');
        const itemsAll = () => Array.from(menu.querySelectorAll('.ss-item'));
        const open = () => { menu.hidden = false; ss.classList.add('open'); input.setAttribute('aria-expanded', 'true'); };
        const close = () => { menu.hidden = true; ss.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); };
        const clearActive = () => itemsAll().forEach(i => i.classList.remove('active'));
        const labelOf = v => { const o = itemsAll().find(i => i.dataset.value === v); return o ? o.textContent : ''; };
        const showAll = () => { itemsAll().forEach(i => { i.hidden = false; }); const e = menu.querySelector('.ss-empty'); if (e) e.remove(); };
        const filter = () => {
          const q = norm(input.value.trim());
          let shown = 0;
          itemsAll().forEach(i => { const m = !q || i.dataset.search.indexOf(q) !== -1; i.hidden = !m; if (m) shown++; });
          let empty = menu.querySelector('.ss-empty');
          if (!shown && !empty) { empty = document.createElement('li'); empty.className = 'ss-empty'; empty.textContent = 'Sin resultados'; menu.appendChild(empty); }
          else if (shown && empty) empty.remove();
          clearActive(); const first = itemsAll().find(i => !i.hidden); if (first) first.classList.add('active');
        };
        const commit = li => {
          hidden.value = li.dataset.value;
          input.value = li.textContent;
          input.classList.remove('invalid');
          close();
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
        };
        input.addEventListener('focus', () => { open(); showAll(); });
        input.addEventListener('input', () => { hidden.value = ''; open(); filter(); });
        input.addEventListener('keydown', e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (menu.hidden) { open(); showAll(); }
            const vis = itemsAll().filter(i => !i.hidden);
            if (!vis.length) return;
            let idx = vis.findIndex(i => i.classList.contains('active'));
            idx = e.key === 'ArrowDown' ? Math.min(vis.length - 1, idx + 1) : Math.max(0, idx - 1);
            clearActive(); vis[idx].classList.add('active'); vis[idx].scrollIntoView({ block: 'nearest' });
          } else if (e.key === 'Enter') {
            const a = itemsAll().find(i => i.classList.contains('active') && !i.hidden);
            if (a) { e.preventDefault(); commit(a); }
          } else if (e.key === 'Escape') { close(); input.value = labelOf(hidden.value); }
        });
        menu.addEventListener('mousedown', e => { const li = e.target.closest('.ss-item'); if (li) { e.preventDefault(); commit(li); } });
        input.addEventListener('blur', () => { setTimeout(() => { if (!ss.contains(document.activeElement)) { close(); input.value = labelOf(hidden.value); } }, 120); });
      });
    },
    progress(pct) { const p = Math.max(0, Math.min(100, Math.round(pct || 0))); return `<div class="progress"><span style="width:${p}%"></span></div>`; },
    /** Convierte una imagen a base64 comprimida para reducir el tamaño de la subida. */
    fileToDataURL(file, maxW = 1000, quality = 0.72) {
      return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) return reject(new Error('El archivo debe ser una imagen (JPG, PNG o WEBP).'));
        if (file.size > 6 * 1024 * 1024) return reject(new Error('La imagen supera el tamaño máximo de 6 MB.'));
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.onload = () => {
          if (file.type === 'image/svg+xml' || file.type === 'image/gif') return resolve(reader.result);
          const img = new Image();
          img.onload = () => {
            const scale = Math.min(1, maxW / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.onerror = () => reject(new Error('La imagen no es válida.'));
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },
    viewImage(src, title = 'Comprobante') {
      Swal.fire({ title, imageUrl: src, imageAlt: title, showCloseButton: true, showConfirmButton: false, customClass: { popup: 'pt-swal pt-swal-image' } });
    },
    download(filename, content, mime = 'text/plain;charset=utf-8') {
      const blob = new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    printHTML(title, html) {
      const w = window.open('', '_blank', 'width=820,height=900');
      if (!w) return UI.toast('Habilite las ventanas emergentes para imprimir.', 'warning');
      const css = new URL('css/styles.css', location.href).href;
      w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
        <link rel="stylesheet" href="${css}"></head><body class="print-body">${html}
        <script>window.onload=function(){setTimeout(function(){window.print();},450);};<\/script></body></html>`);
      w.document.close();
    }
  };

  /* ------------------------------------------------------------------
     Documentos: recibo interno (no tributario)
     ------------------------------------------------------------------ */
  const docs = {
    recibo(pagoId) {
      const pg = db.find('pagos', pagoId);
      if (!pg) return '';
      const pen = db.find('pensiones', pg.pensionId);
      const est = db.find('estudiantes', pg.estudianteId);
      const c = pen && db.find('ciclos', pen.cicloId);
      const pr = c && db.find('programas', c.programaId);
      const row = (k, v) => `<div class="receipt-row"><span>${k}</span><span>${v}</span></div>`;
      return `<div class="receipt">
        <div class="receipt-head">
          <div class="flex items-center gap-3">${LOGO_SVG(44, 'rcp')}<div><p class="font-extrabold text-lg leading-tight">PLUSTWENTY</p><p class="text-xs opacity-80">${esc(ACADEMIA.direccion)}</p></div></div>
          <div class="text-right"><p class="text-[11px] uppercase tracking-widest opacity-80">Recibo interno</p><p class="font-extrabold text-xl">${esc(pg.reciboNumero || '—')}</p></div>
        </div>
        <div class="receipt-body">
          <div class="flex items-start justify-between gap-4 mb-4">
            <div><p class="text-xs uppercase tracking-wider text-slate-500 font-bold">Recibido de</p><p class="font-bold text-base">${esc(est ? `${est.nombres} ${est.apellidos}` : '—')}</p><p class="text-sm text-slate-500">DNI ${esc(est?.dni || '—')} · ${esc(est?.codigo || '')}</p></div>
            <span class="stamp">PAGADO</span>
          </div>
          ${row('Programa / Ciclo', esc(pr ? `${pr.nombre} (${pr.siglas}) · ${c.nombre}` : '—'))}
          ${row('Concepto', esc(pen?.concepto || '—'))}
          ${row('Método de pago', esc(pg.metodo))}
          ${row('N° de operación', esc(pg.numeroOperacion))}
          ${row('Fecha de pago', fmtDate(pg.fechaPago))}
          ${row('Verificado por', esc(pg.revisadoPor || '—'))}
          ${row('Fecha de verificación', fmtDateTime(pg.fechaRevision))}
          <div class="receipt-total"><span>Total recibido</span><span>${money(pg.monto)}</span></div>
        </div>
        <div class="receipt-foot">Documento interno de control — <strong>no constituye comprobante de pago tributario</strong> (SUNAT).<br>${esc(ACADEMIA.nombre)} · RUC ${ACADEMIA.ruc} · ${esc(ACADEMIA.telefono)}</div>
      </div>`;
    },
    printRecibo(pagoId) {
      const pg = db.find('pagos', pagoId);
      UI.printHTML(`Recibo ${pg?.reciboNumero || ''}`, docs.recibo(pagoId));
    }
  };

  const LOGO_SVG = (size = 40) => `<img src="images/logo.png" alt="Plus Twenty · Academia Preuniversitaria" style="height:${size}px;width:auto;display:block;border-radius:${Math.max(4, Math.round(size * 0.08))}px" />`;

  /* ------------------------------------------------------------------
     Shell SPA (sidebar + router por hash)
     ------------------------------------------------------------------ */
  const Shell = {
    views: {}, current: null, charts: [], defaultView: null, onRender: null,
    init({ views, defaultView, user, onRender }) {
      this.views = views; this.defaultView = defaultView; this.onRender = onRender;
      const roleLabel = user.rol === 'admin' ? 'Administrador' : (user.tipo || 'Estudiante');
      document.querySelectorAll('[data-user-name]').forEach(el => (el.textContent = user.nombre));
      document.querySelectorAll('[data-user-initials]').forEach(el => (el.textContent = initials(user.nombre)));
      document.querySelectorAll('[data-user-role]').forEach(el => (el.textContent = roleLabel));
      document.querySelectorAll('[data-today]').forEach(el => (el.textContent = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })));
      document.querySelectorAll('[data-logo]').forEach((el, i) => (el.innerHTML = LOGO_SVG(+el.dataset.logo || 40, 'sh' + i)));

      document.addEventListener('click', e => {
        const go = e.target.closest('[data-go]');
        if (go) {
          e.preventDefault();
          const [v, q] = go.dataset.go.split('?');
          this.go(v, Object.fromEntries(new URLSearchParams(q || '')));
          return;
        }
        if (e.target.closest('[data-logout]')) {
          e.preventDefault();
          UI.confirm({ title: '¿Cerrar sesión?', text: 'Saldrá del sistema PLUSTWENTY.', icon: 'question', confirmText: 'Sí, salir' })
            .then(ok => ok && auth.logout());
        }
        if (e.target.closest('[data-sidebar-toggle]')) this.toggleSidebar();
        if (e.target.closest('#sidebar-overlay')) this.closeSidebar();
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') { UI.closeModal(); this.closeSidebar(); } });
      window.addEventListener('hashchange', () => {
        // Antes se hacía hydrate() (bootstrap completo) en CADA cambio de pestaña: lento y pesado.
        // Ahora solo re-renderizamos desde la caché, que ya se mantiene al día con las escrituras
        // del propio usuario. Para ver cambios hechos por otros, recargar la página.
        if (!ME) { location.replace('index.html'); return; }
        this.render();
      });
      if (global.Chart) {
        Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
        Chart.defaults.color = '#64748B';
      }
      this.render();
    },
    parse() {
      const h = location.hash.replace(/^#\/?/, '');
      const [v, q] = h.split('?');
      return { view: this.views[v] ? v : this.defaultView, params: Object.fromEntries(new URLSearchParams(q || '')) };
    },
    go(view, params = {}) {
      const q = new URLSearchParams(params).toString();
      const h = '#' + view + (q ? '?' + q : '');
      if (location.hash === h) this.render(); else location.hash = h;
    },
    render() {
      const { view, params } = this.parse();
      const v = this.views[view];
      this.destroyCharts();
      UI.closeModal(true);
      this.current = view;
      document.querySelectorAll('[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === view));
      const t = document.getElementById('page-title'); if (t) t.textContent = v.title;
      const s = document.getElementById('page-subtitle'); if (s) s.textContent = v.subtitle || '';
      document.title = `${v.title} · PLUSTWENTY`;
      const root = document.getElementById('view-root');
      // Preservar foco y cursor del campo de filtro activo: al re-renderizar con
      // innerHTML el input se recrea y, sin esto, el buscador pierde el foco en
      // cada tecla durante el filtrado en vivo.
      const ae = document.activeElement;
      const focusId = (ae && root && root.contains(ae) && ae.id) ? ae.id : null;
      let selStart = null, selEnd = null;
      if (focusId) { try { selStart = ae.selectionStart; selEnd = ae.selectionEnd; } catch (_) {} }
      try {
        root.innerHTML = `<div class="view-enter">${v.render(params)}</div>`;
        // Se pasa el contenedor interno (se destruye en cada render): así los listeners no se acumulan entre navegaciones.
        v.mount && v.mount(params, root.firstElementChild);
      } catch (err) {
        console.error(err);
        root.innerHTML = UI.empty('Ocurrió un error al cargar esta sección.', 'fa-bug');
      }
      if (focusId) {
        const again = document.getElementById(focusId);
        if (again) {
          again.focus();
          if (selStart !== null) { try { again.setSelectionRange(selStart, selEnd); } catch (_) {} }
        }
      }
      this.closeSidebar();
      window.scrollTo(0, 0);
      this.onRender && this.onRender(view);
    },
    refresh() {
      const y = window.scrollY;
      this.render();
      window.scrollTo(0, y);
    },
    chart(id, cfg) {
      const el = document.getElementById(id);
      if (!el || !global.Chart) return null;
      const c = new Chart(el, cfg);
      this.charts.push(c);
      return c;
    },
    destroyCharts() { this.charts.forEach(c => c.destroy()); this.charts = []; },
    toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); document.getElementById('sidebar-overlay')?.classList.toggle('show'); },
    closeSidebar() { document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('sidebar-overlay')?.classList.remove('show'); }
  };

  /* ------------------------------------------------------------------
     Estructuras de datos: Pila (LIFO) y Cola (FIFO)
     - Cola: pagos pendientes de verificación (el primero que reporta, el primero que se atiende).
     - Pila: historiales (lo último que ocurrió se ve primero).
     ------------------------------------------------------------------ */
  class Pila {
    constructor() { this.datos = []; }
    push(x) { this.datos.push(x); return this; }
    pop() { return this.datos.pop(); }
    peek() { return this.datos[this.datos.length - 1]; }
    get size() { return this.datos.length; }
    /** Elementos en el orden en que saldrían: primero el último que entró (tope de la pila). */
    toArray() { return this.datos.slice().reverse(); }
    static desde(items) { const p = new Pila(); items.forEach(i => p.push(i)); return p; }
  }
  class Cola {
    constructor() { this.datos = []; }
    enqueue(x) { this.datos.push(x); return this; }
    dequeue() { return this.datos.shift(); }
    peek() { return this.datos[0]; }
    get size() { return this.datos.length; }
    /** Elementos en el orden en que saldrían: primero el que entró antes. */
    toArray() { return this.datos.slice(); }
    static desde(items) { const c = new Cola(); items.forEach(i => c.enqueue(i)); return c; }
  }

  /* ------------------------------------------------------------------
     Validación estricta de formularios y búsquedas
     - Filtra los caracteres no permitidos mientras se escribe (DNI solo números, nombres solo letras…).
     - Muestra el error en rojo debajo de cada campo (sin globos del navegador).
     - Se aplica a TODOS los formularios y cuadros de búsqueda por delegación de eventos.
     ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------
     Indicador de carga global ("Guardando…")
     Las llamadas al servidor son síncronas y congelan la pantalla; por eso primero se
     muestra el aviso, se deja que el navegador lo dibuje y recién entonces se llama al servidor.
     ------------------------------------------------------------------ */
  const Cargando = (() => {
    let el = null, activos = 0;
    function asegurar() {
      if (el && el.isConnected) return el;
      el = document.createElement('div');
      el.className = 'cargando-overlay';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = '<div class="cargando-card"><div class="cargando-spinner" aria-hidden="true"></div><p class="cargando-txt">Guardando…</p><p class="cargando-sub">Esto puede tardar unos segundos</p></div>';
      document.body.appendChild(el);
      return el;
    }
    function mostrar(texto) {
      activos++;
      const e = asegurar();
      e.querySelector('.cargando-txt').textContent = texto || 'Guardando…';
      e.classList.add('show');
      document.body.classList.add('cargando-activo');
    }
    function ocultar() {
      activos = Math.max(0, activos - 1);
      if (activos === 0 && el) { el.classList.remove('show'); document.body.classList.remove('cargando-activo'); }
    }
    // Espera a que el navegador dibuje el aviso (con tope por si la pestaña está en segundo plano).
    function pintar() {
      return new Promise(res => {
        let hecho = false;
        const fin = () => { if (!hecho) { hecho = true; res(); } };
        requestAnimationFrame(() => setTimeout(fin, 30));
        setTimeout(fin, 150);
      });
    }
    // Ejecuta trabajo pesado mostrando el aviso; admite funciones síncronas o asíncronas.
    async function ejecutar(fn, texto) {
      mostrar(texto);
      try { await pintar(); return await fn(); }
      finally { ocultar(); }
    }
    return { mostrar, ocultar, pintar, ejecutar };
  })();

  const Forms = (() => {
    const LET = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
    const colapsar = v => v.replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
    const esFecha = iso => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };
    const soloLetras = v => (v.match(new RegExp(`[${LET}]`, 'g')) || []).length;

    /* Celulares inventados: dígitos repetidos (999999999, 911111111) o solo 2 dígitos alternados (989898989).
       Las secuencias (987654321, 912345678) SÍ se permiten: pueden ser números reales. */
    const celularFalso = v => /(\d)\1{5,}/.test(v) || new Set(v.slice(1)).size <= 2;
    const REGLAS = {
      dni: {
        hint: 'El DNI solo admite números (8 dígitos).',
        limpiar: v => v.replace(/\D/g, '').slice(0, 8),
        validar: v => !/^\d{8}$/.test(v) ? 'El DNI debe tener exactamente 8 dígitos.' : (/^(\d)\1{7}$/.test(v) ? 'El DNI ingresado no es válido.' : '')
      },
      celular: {
        hint: 'El celular solo admite números (9 dígitos).',
        limpiar: v => v.replace(/\D/g, '').slice(0, 9),
        validar: v => !/^\d{9}$/.test(v) ? 'El celular debe tener 9 dígitos.'
          : (v[0] !== '9' ? 'El celular debe empezar con 9.'
          : (celularFalso(v) ? 'Ingrese un celular real: no se aceptan números con dígitos repetidos (por ejemplo 999999999).' : ''))
      },
      operacion: {
        hint: 'El N° de operación solo admite números (6 dígitos).',
        limpiar: v => v.replace(/\D/g, '').slice(0, 6),
        validar: v => /^\d{6}$/.test(v) ? '' : 'El N° de operación debe tener exactamente 6 dígitos.'
      },
      persona: {
        hint: 'Solo se permiten letras (sin números ni símbolos).',
        limpiar: v => colapsar(v.replace(new RegExp(`[^${LET}\\s'-]`, 'g'), '')).slice(0, 60),
        validar: v => soloLetras(v) < 2 ? 'Ingrese al menos 2 letras.' : ''
      },
      texto: {
        hint: 'No se permiten símbolos como < > { } [ ] | ^ ~ ` $ % * = "',
        limpiar: v => colapsar(v.replace(/[<>{}[\]|\\^~`$%*="]/g, '')),
        validar: () => ''
      },
      titulo: {
        hint: 'Solo letras, números, espacios y . , & ( ) -',
        limpiar: v => colapsar(v.replace(new RegExp(`[^${LET}0-9\\s.,&()-]`, 'g'), '')).slice(0, 80),
        validar: v => soloLetras(v) < 3 ? 'Ingrese un nombre válido (mínimo 3 letras).' : ''
      },
      siglas: {
        hint: 'Las siglas solo admiten letras y números, sin espacios.',
        limpiar: v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
        validar: v => v.length < 2 ? 'Las siglas deben tener entre 2 y 10 caracteres.' : ''
      },
      ciclo: {
        hint: 'Formato del ciclo: AAAA-II (por ejemplo 2026-II).',
        limpiar: v => v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12),
        validar: v => /^\d{4}-[A-Z0-9]{1,6}$/.test(v) ? '' : 'Use el formato AAAA-II (por ejemplo 2026-II).'
      },
      email: {
        hint: 'El correo solo admite letras, números y . _ % + - (con una sola @).',
        limpiar: v => {
          let r = v.replace(/\s/g, '').toLowerCase().replace(/[^a-z0-9._%+@-]/g, '');
          const k = r.indexOf('@');
          if (k >= 0) r = r.slice(0, k + 1) + r.slice(k + 1).replace(/@/g, '').replace(/[^a-z0-9.-]/g, '');   // una sola @; el dominio solo letras, números, punto y guion
          return r.replace(/^[._%+-]+/, '').replace(/\.{2,}/g, '.').slice(0, 80);
        },
        validar: v => {
          if ((v.match(/@/g) || []).length > 1) return 'El correo solo puede tener una @.';
          const [local = '', dom = ''] = v.split('@');
          const ok = local.length >= 3 && /^[a-z0-9]([a-z0-9._%+-]*[a-z0-9])?$/.test(local)
            && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(dom)
            && !v.includes('..');
          return ok ? '' : 'Ingrese un correo válido (por ejemplo nombre@gmail.com).';
        }
      },
      direccion: {
        hint: 'Solo letras, números y . , # ° / - (sin símbolos como " \' ¿ ¡ ? ´ ¨ + *).',
        limpiar: v => colapsar(v.replace(new RegExp(`[^${LET}0-9\\s.,#°º/-]`, 'g'), '')).slice(0, 120),
        validar: v => (soloLetras(v) < 3 || /(.)\1{4,}/i.test(v))
          ? 'Ingrese un dato válido: use letras y números reales, sin caracteres repetidos.' : ''
      },
      username: {
        hint: 'El usuario solo admite letras minúsculas, números, punto y guion bajo.',
        limpiar: v => v.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24),
        validar: v => /^[a-z0-9][a-z0-9._]{2,23}$/.test(v) && !v.includes('..')
          ? '' : 'El usuario debe tener de 3 a 24 caracteres (letras, números, punto o guion bajo) y empezar con letra o número.'
      },
      password: {
        hint: 'La contraseña no admite espacios.',
        limpiar: v => v.replace(/\s/g, '').slice(0, 40),
        validar: v => v.length < 6 ? 'La contraseña debe tener al menos 6 caracteres.' : ''
      },
      busqueda: {
        hint: 'Solo letras, números y guion (sin símbolos como * % " \').',
        limpiar: v => {
          let r = colapsar(v.replace(new RegExp(`[^${LET}0-9\\s-]`, 'g'), '')).slice(0, 40);
          if (/^\d+$/.test(r)) r = r.slice(0, 8);      // solo números = DNI (máx. 8 dígitos)
          return r;
        },
        validar: () => ''
      }
    };
    const POR_NOMBRE = { dni: 'dni', apo_dni: 'dni', telefono: 'celular', apo_telefono: 'celular', email: 'email', username: 'username', numeroOperacion: 'operacion' };

    const reglaDe = el => {
      if (el.matches?.('.est-picker-input') || el.type === 'search') return REGLAS.busqueda;
      const k = el.dataset?.v || POR_NOMBRE[el.name];
      return k ? REGLAS[k] : null;
    };

    /* ---------- presentación de errores ---------- */
    const hostDe = el => el.closest('.field') || el.closest('.input-icon') || el.parentElement;
    const errorDe = el => hostDe(el).querySelector(':scope > .field-error');

    function mostrar(el, msg) {
      const host = hostDe(el);
      let p = errorDe(el);
      if (!msg) {
        if (p) p.remove();
        el.classList.remove('invalid'); el.removeAttribute('aria-invalid');
        return;
      }
      if (!p) { p = document.createElement('p'); p.className = 'field-error'; p.setAttribute('role', 'alert'); host.appendChild(p); }
      delete p.dataset.flash; clearTimeout(p._t);
      p.textContent = msg;
      el.classList.add('invalid'); el.setAttribute('aria-invalid', 'true');
    }
    /** Aviso temporal cuando se rechaza un carácter al escribir. No pisa un error real. */
    function aviso(el, msg) {
      let p = errorDe(el);
      if (p && !p.dataset.flash) return;
      if (!p) { p = document.createElement('p'); p.className = 'field-error'; p.setAttribute('role', 'alert'); hostDe(el).appendChild(p); }
      p.dataset.flash = '1'; p.textContent = msg; el.classList.add('invalid');
      clearTimeout(p._t);
      p._t = setTimeout(() => { if (p.dataset.flash) { p.remove(); el.classList.remove('invalid'); } }, 2200);
    }

    /* ---------- reglas de validación por campo ---------- */
    /** Validaciones propias de una pantalla: <input data-validar="nombre"> llama a Forms.validadores[nombre](el, form). */
    const VALIDADORES = {};
    function mensaje(el) {
      const base = mensajeBase(el);
      if (base || !el.dataset || !el.dataset.validar) return base;
      const fn = VALIDADORES[el.dataset.validar];
      return fn && el.value ? (fn(el, el.form) || '') : '';
    }
    function mensajeBase(el) {
      const picker = el.closest?.('.est-picker');
      if (picker) {                                   // buscador con autocompletado (estudiante / programa)
        if (picker.hasAttribute('data-filtro')) return '';
        const hid = picker.querySelector('input[type=hidden]');
        if (hid.value) return '';
        if (el.value.trim()) return 'Seleccione una opción de la lista de sugerencias.';
        return el.required ? (picker.dataset.tipo === 'programa'
          ? 'Busque y seleccione un programa (por nombre o siglas).'
          : picker.dataset.tipo === 'ciclo'
            ? 'Busque y seleccione un ciclo (por siglas, universidad o nombre del ciclo).'
            : 'Busque y seleccione un estudiante (por DNI, apellidos o nombres).') : '';
      }
      if (el.tagName === 'SELECT') return el.required && !el.value ? 'Seleccione una opción.' : '';

      const v = el.value;
      if (el.type === 'date') {
        if (!v) return el.required ? (el.validity.badInput ? 'La fecha está incompleta o no es válida.' : 'Este campo es obligatorio.') : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(parseDate(v))) return 'La fecha no es válida.';
        if (el.min && v < el.min) return el.dataset.minMsg || `La fecha no puede ser anterior al ${esFecha(el.min)}.`;
        if (el.max && v > el.max) return el.dataset.maxMsg || `La fecha no puede ser posterior al ${esFecha(el.max)}.`;
        const otro = el.dataset.after && el.form?.elements[el.dataset.after]?.value;
        if (otro && v <= otro) return el.dataset.afterMsg || 'Debe ser posterior a la fecha de inicio.';
        return '';
      }
      if (el.type === 'number') {
        if (!v.trim()) return el.required ? (el.validity.badInput ? 'Ingrese un número válido.' : 'Este campo es obligatorio.') : '';
        const n = Number(v);
        if (!isFinite(n)) return 'Ingrese un número válido.';
        if (el.min !== '' && n < Number(el.min)) return `El valor mínimo permitido es ${el.min}.`;
        if (el.max !== '' && n > Number(el.max)) return `El valor máximo permitido es ${el.max}.`;
        const paso = el.step && el.step !== 'any' ? Number(el.step) : 1;
        if (Math.abs(Math.round(n / paso) * paso - n) > 1e-6) return paso >= 1 ? 'Ingrese un número entero.' : 'Use como máximo 2 decimales.';
        return '';
      }
      if (!v.trim()) return el.required ? 'Este campo es obligatorio.' : '';
      const regla = reglaDe(el);
      if (regla) { const m = regla.validar(v.trim(), el); if (m) return m; }
      if (el.minLength > 0 && v.trim().length < el.minLength) return `Escriba al menos ${el.minLength} caracteres.`;
      if (el.pattern && !new RegExp(`^(?:${el.pattern})$`).test(v)) return el.title || 'El formato ingresado no es válido.';
      const d = el.dataset.differs;
      if (d && el.form?.elements[d] && el.form.elements[d].value === v) return el.dataset.differsMsg || 'No puede ser igual al otro campo.';
      return '';
    }

    const validable = el => {
      if (el.disabled || el.readOnly || el.closest('[hidden]')) return false;
      if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return true;
      return el.tagName === 'INPUT' && !['hidden', 'button', 'submit', 'reset', 'file', 'color', 'checkbox', 'radio', 'image'].includes(el.type);
    };
    const controles = form => Array.from(form.querySelectorAll('input,select,textarea')).filter(validable);

    function validarForm(form) {
      let primero = null;
      controles(form).forEach(el => {
        el.dataset.touched = '1';
        const m = mensaje(el);
        mostrar(el, m);
        if (m && !primero) primero = el;
      });
      return primero;
    }

    /* ---------- manejadores globales ---------- */
    function aplicarLimpieza(el, regla) {
      const antes = el.value;
      const despues = regla.limpiar(antes, el);
      if (antes === despues) return false;
      let pos = null;
      try { pos = el.selectionStart; } catch (_) { /* type=email no expone selección */ }
      el.value = despues;
      if (pos !== null) {
        const nueva = regla.limpiar(antes.slice(0, pos), el).length;
        try { el.setSelectionRange(nueva, nueva); } catch (_) { /* sin selección */ }
      }
      // si solo cambiaron espacios sobrantes, no molestar con el aviso
      return antes.replace(/\s/g, '') !== despues.replace(/\s/g, '');
    }
    function onInput(e) {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || e.isComposing) return;
      const regla = reglaDe(el);
      if (regla && el.type !== 'number' && el.type !== 'date') {
        if (aplicarLimpieza(el, regla)) aviso(el, regla.hint);
      }
      if (el.dataset.touched) {
        const m = mensaje(el);
        const p = errorDe(el);
        if (m || (p && !p.dataset.flash)) mostrar(el, m);
      }
    }
    function onKeydown(e) {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== 'number') return;
      const paso = el.step && el.step !== 'any' ? Number(el.step) : 1;
      if (['e', 'E', '+', '-'].includes(e.key) || (paso >= 1 && (e.key === '.' || e.key === ','))) e.preventDefault();
    }
    // Si el usuario está pulsando un botón (Guardar / Cancelar), no se valida al salir del campo:
    // el mensaje desplazaría el botón y el clic se perdería.
    let presionando = false;
    document.addEventListener('pointerdown', e => { presionando = !!e.target.closest?.('button, a, [role=button]'); }, true);
    document.addEventListener('pointerup', () => setTimeout(() => { presionando = false; }, 0), true);
    document.addEventListener('pointercancel', () => { presionando = false; }, true);

    function onFocusOut(e) {
      if (presionando) return;
      const el = e.target;
      if (!el.form && !el.closest?.('.est-picker') && el.type !== 'search') return;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
      if (!validable(el) || el.closest('.est-picker[data-filtro]')) return;
      // al escribir en un buscador de formulario y salir sin elegir de la lista, se avisa
      el.dataset.touched = '1';
      if (el.type === 'search') return;
      mostrar(el, mensaje(el));
    }
    function onChange(e) {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.type === 'hidden') {          // se eligió una opción del buscador
        const txt = el.closest('.est-picker')?.querySelector('.est-picker-input');
        if (txt && !el.closest('.est-picker[data-filtro]') && txt.dataset.touched) mostrar(txt, mensaje(txt));
        return;
      }
      if (!el.dataset) return;
      if (el.dataset.touched) mostrar(el, mensaje(el));
      // un cambio en un campo puede invalidar a otro dependiente (p. ej. fecha fin / fecha inicio)
      el.form?.querySelectorAll('[data-after],[data-differs],[data-validar]').forEach(o => { if (o !== el && o.dataset.touched) mostrar(o, mensaje(o)); });
    }
    function onSubmit(e) {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.hasAttribute('data-sin-validar')) return;
      if (form.__reenviando) return;                    // segunda pasada (ya validada y con aviso de carga)
      if (form.__enCarga) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // doble clic
      const malo = validarForm(form);
      if (malo) {
        e.preventDefault();
        e.stopImmediatePropagation();
        malo.scrollIntoView({ block: 'center', behavior: 'smooth' });
        try { malo.focus({ preventScroll: true }); } catch (_) { /* sin foco */ }
        UI.toast('Revise los campos marcados en rojo.', 'warning');
        return;
      }
      if (form.hasAttribute('data-sin-carga') || typeof form.requestSubmit !== 'function') return;
      // Formulario válido: mostrar "Guardando…", dejar que se dibuje y recién entonces ejecutar el guardado.
      e.preventDefault();
      e.stopImmediatePropagation();
      const sub = e.submitter && e.submitter.form === form ? e.submitter : undefined;
      form.__enCarga = true;
      Cargando.mostrar(form.dataset.cargando || 'Guardando…');
      Cargando.pintar().then(() => {
        form.__reenviando = true;
        try { form.requestSubmit(sub); }
        finally { form.__reenviando = false; form.__enCarga = false; Cargando.ocultar(); }
      });
    }

    /* ---------- preparación de formularios / buscadores nuevos ---------- */
    function scan() {
      document.querySelectorAll('form:not([data-fv])').forEach(form => {
        form.dataset.fv = '1';
        form.noValidate = true;                 // los errores se muestran en pantalla, no con globos del navegador
        form.querySelectorAll('input,textarea').forEach(el => {
          if (el.type === 'date') {
            if (!el.min) el.min = fechaHaceAnios(10);
            if (!el.max) { const d = new Date(); d.setFullYear(d.getFullYear() + 10); el.max = toISO(d); }
          } else if (['text', 'email', 'tel', 'password'].includes(el.type) && el.maxLength < 0) el.maxLength = 80;
          else if (el.tagName === 'TEXTAREA' && el.maxLength < 0) el.maxLength = 300;
          const r = reglaDe(el);
          if (r === REGLAS.dni || r === REGLAS.celular || r === REGLAS.operacion) el.inputMode = 'numeric';
          if (el.type !== 'password') el.autocomplete = 'off';
        });
      });
      // Ojo para mostrar/ocultar contraseña en cada campo de contraseña (la pantalla de acceso tiene el suyo).
      document.querySelectorAll('input[type=password]:not([data-ojo])').forEach(el => {
        el.dataset.ojo = '1';
        if (el.closest('#login-form') || el.closest('.pw-wrap')) return;
        const caja = document.createElement('div');
        caja.className = 'pw-wrap';
        el.parentNode.insertBefore(caja, el);
        caja.appendChild(el);
        el.classList.add('con-ojo');
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'pw-toggle'; b.tabIndex = -1;
        b.setAttribute('aria-label', 'Mostrar contraseña'); b.setAttribute('aria-pressed', 'false'); b.title = 'Mostrar contraseña';
        b.innerHTML = '<i class="fa-solid fa-eye"></i>';
        b.addEventListener('mousedown', e => e.preventDefault());      // el campo no pierde el foco
        b.addEventListener('click', () => {
          const ver = el.type === 'password';
          el.type = ver ? 'text' : 'password';
          b.setAttribute('aria-pressed', String(ver));
          b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña'); b.title = b.getAttribute('aria-label');
          b.firstElementChild.className = 'fa-solid ' + (ver ? 'fa-eye-slash' : 'fa-eye');
        });
        caja.appendChild(b);
      });
      document.querySelectorAll('input[type=search]:not([data-fv]),.est-picker-input:not([data-fv])').forEach(el => {
        el.dataset.fv = '1'; el.maxLength = 40; el.autocomplete = 'off'; el.spellcheck = false;
      });
    }

    function instalar() {
      if (document.getElementById('login-form')) return;       // la pantalla de acceso tiene su propia lógica
      document.addEventListener('input', onInput, true);
      document.addEventListener('keydown', onKeydown, true);
      document.addEventListener('focusout', onFocusOut, true);
      document.addEventListener('change', onChange, true);
      document.addEventListener('submit', onSubmit, true);
    }
    return { instalar, scan, mensaje, validarForm, mostrar, REGLAS, validadores: VALIDADORES, esFecha };
  })();

  /* ------------------------------------------------------------------
     Paginación automática de tablas (10 filas por página)
     Cualquier tabla .table con más de 10 filas recibe su barra de páginas.
     Para excluir una tabla (si la pagina su propia vista) se le agrega la clase "no-auto-page".
     ------------------------------------------------------------------ */
  const Pager = (() => {
    const POR_PAGINA = 10;
    const estado = new Map();                    // clave de tabla -> { page, total }

    function clave(tabla) {
      const modal = tabla.closest('#pt-modal');
      const raiz = modal || document.getElementById('view-root') || document;
      const ambito = modal ? 'm:' + (modal.querySelector('.modal-title')?.textContent || '') : 'v:' + (location.hash.split('?')[0] || '#');
      return ambito + '#' + Array.from(raiz.querySelectorAll('table.table')).indexOf(tabla);
    }
    function numeros(pag, paginas) {
      const out = [];
      for (let i = 1; i <= paginas; i++) {
        if (i === 1 || i === paginas || Math.abs(i - pag) <= 1) out.push(i);
        else if (out[out.length - 1] !== '…') out.push('…');
      }
      return out;
    }
    function aplicar(tabla) {
      const filas = Array.from(tabla.tBodies[0]?.rows || []);
      const total = filas.length;
      const paginas = Math.ceil(total / POR_PAGINA);
      if (paginas <= 1) return;
      const k = clave(tabla);
      const prev = estado.get(k);
      let page = prev && prev.total === total ? Math.min(prev.page, paginas) : 1;
      const wrap = tabla.closest('.table-wrap') || tabla;
      const barra = document.createElement('div');
      barra.className = 'pager no-print';
      wrap.after(barra);

      const pintar = () => {
        const ini = (page - 1) * POR_PAGINA;
        filas.forEach((f, i) => f.classList.toggle('pg-hidden', i < ini || i >= ini + POR_PAGINA));
        estado.set(k, { page, total });
        barra.innerHTML = `
          <p class="pager-info">Mostrando <b>${ini + 1}–${Math.min(total, ini + POR_PAGINA)}</b> de <b>${total}</b> registros</p>
          <div class="pager-nav">
            <button type="button" class="pg-btn" data-pg="${page - 1}" ${page === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i><span>Anterior</span></button>
            ${numeros(page, paginas).map(n => n === '…'
              ? '<span class="pg-gap">…</span>'
              : `<button type="button" class="pg-btn pg-num${n === page ? ' active' : ''}" data-pg="${n}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>`).join('')}
            <button type="button" class="pg-btn" data-pg="${page + 1}" ${page === paginas ? 'disabled' : ''}><span>Siguiente</span><i class="fa-solid fa-chevron-right"></i></button>
          </div>`;
      };
      barra.addEventListener('click', e => {
        const b = e.target.closest('[data-pg]');
        if (!b || b.disabled) return;
        page = Math.min(paginas, Math.max(1, parseInt(b.dataset.pg, 10) || 1));
        pintar();
        if (wrap.getBoundingClientRect().top < 60) wrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      pintar();
    }
    function scan() {
      document.querySelectorAll('table.table:not([data-pg]):not(.no-auto-page)').forEach(t => {
        if (t.closest('.receipt,.no-auto-page')) return;
        t.dataset.pg = '1';
        aplicar(t);
      });
    }
    /** Devuelve una copia del HTML de un contenedor con todas las filas visibles y sin barras de página (para imprimir). */
    function sinPaginar(contenedor) {
      const c = contenedor.cloneNode(true);
      c.querySelectorAll('.pager').forEach(p => p.remove());
      c.querySelectorAll('.pg-hidden').forEach(f => f.classList.remove('pg-hidden'));
      return c.innerHTML;
    }
    return { scan, sinPaginar, POR_PAGINA };
  })();

  /* ------------------------------------------------------------------
     Exportación real a Excel (.xlsx) con plantilla corporativa (ExcelJS)
     ------------------------------------------------------------------ */
  const excel = {
    disponible: () => !!global.ExcelJS,
    /** 'AAAA-MM-DD' -> Date (UTC) para que Excel la guarde como fecha real. */
    fecha(iso) {
      if (!iso) return null;
      const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    },
    /**
     * columnas: [{ titulo, ancho, tipo: 'texto'|'codigo'|'fecha'|'dinero'|'entero' }]
     * filas: arreglo de arreglos (las fechas como Date); totales: { etiqueta, columnas: [{ idx, tipo: 'suma'|'conteo', valor }] }
     * resumen: { titulo, encabezados: [...], tipos: [...], filas: [[...]] } (segunda hoja, opcional)
     */
    async generar({ hoja, titulo, periodo, usuario, columnas, filas, totales, resumen }) {
      const XL = global.ExcelJS;
      const NAVY = 'FF1F2937', AZUL = 'FF2563EB', ZEBRA = 'FFF9FAFB', LINEA = 'FFE5E7EB';
      const FORMATO = { fecha: 'dd/mm/yyyy', dinero: '"S/" #,##0.00', entero: '0', texto: '@', codigo: '@' };
      const borde = { style: 'thin', color: { argb: LINEA } };
      const bordes = { top: borde, left: borde, bottom: borde, right: borde };
      const n = columnas.length;
      const HEADER_ROW = 7;

      const wb = new XL.Workbook();
      wb.creator = ACADEMIA.nombre; wb.created = new Date();
      const ws = wb.addWorksheet(hoja, {
        views: [{ state: 'frozen', ySplit: HEADER_ROW, showGridLines: false }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .6, bottom: .6, header: .3, footer: .3 } }
      });
      ws.columns = columnas.map(c => ({ width: c.ancho || 16 }));

      const linea = (fila, texto, est = {}) => {
        ws.mergeCells(fila, 1, fila, n);
        const c = ws.getCell(fila, 1);
        c.value = texto;
        c.font = { name: 'Calibri', size: est.size || 10, bold: !!est.bold, italic: !!est.italic, color: { argb: est.color || 'FF475569' } };
        c.alignment = { vertical: 'middle', horizontal: est.align || 'left' };
        if (est.alto) ws.getRow(fila).height = est.alto;
      };
      linea(1, ACADEMIA.nombre.toUpperCase(), { size: 17, bold: true, color: NAVY, alto: 30 });
      linea(2, `RUC ${ACADEMIA.ruc}  ·  ${ACADEMIA.direccion}  ·  Tel. ${ACADEMIA.telefono}`, { size: 9, color: 'FF6B7280' });
      linea(3, titulo, { size: 13, bold: true, color: AZUL, alto: 22 });
      linea(4, `Periodo: ${periodo}`, { size: 10, bold: true, color: 'FF1F2937' });
      linea(5, `Fecha de emisión: ${new Date().toLocaleDateString('es-PE')}   ·   Generado por: ${usuario}`, { size: 9, color: 'FF6B7280' });
      ws.mergeCells(6, 1, 6, n);                                   // franja de color separadora
      ws.getCell(6, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
      ws.getRow(6).height = 4;

      const cab = ws.getRow(HEADER_ROW);
      columnas.forEach((c, i) => {
        const cell = cab.getCell(i + 1);
        cell.value = c.titulo;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = bordes;
      });
      cab.height = 26;

      filas.forEach((f, r) => {
        const row = ws.getRow(HEADER_ROW + 1 + r);
        f.forEach((valor, i) => {
          const c = columnas[i], cell = row.getCell(i + 1);
          cell.value = valor;
          cell.numFmt = FORMATO[c.tipo] || '@';
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = bordes;
          cell.alignment = { vertical: 'middle', horizontal: c.tipo === 'dinero' ? 'right' : (['fecha', 'entero', 'codigo'].includes(c.tipo) ? 'center' : 'left') };
          if (r % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
        });
      });

      const primera = HEADER_ROW + 1, ultima = HEADER_ROW + filas.length;
      let siguiente = ultima + 1;
      if (totales && filas.length) {
        const row = ws.getRow(siguiente);
        const idxs = totales.columnas.map(c => c.idx);
        const hasta = Math.min(...idxs) - 1;
        if (hasta >= 1) {
          if (hasta >= 2) ws.mergeCells(siguiente, 1, siguiente, hasta);
          const l = row.getCell(1);
          l.value = totales.etiqueta;
          l.font = { name: 'Calibri', size: 10, bold: true, color: NAVY };
          l.alignment = { horizontal: 'right', vertical: 'middle' };
        }
        for (let i = 1; i <= n; i++) {
          const cell = row.getCell(i);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
          cell.border = { top: { style: 'medium', color: { argb: NAVY } }, bottom: borde, left: borde, right: borde };
        }
        totales.columnas.forEach(t => {
          const letra = ws.getColumn(t.idx).letter;
          const cell = row.getCell(t.idx);
          cell.value = { formula: `${t.tipo === 'conteo' ? 'COUNTA' : 'SUM'}(${letra}${primera}:${letra}${ultima})`, result: t.valor };
          cell.numFmt = t.tipo === 'conteo' ? '0' : FORMATO.dinero;
          cell.font = { name: 'Calibri', size: 11, bold: true, color: NAVY };
          cell.alignment = { horizontal: t.tipo === 'conteo' ? 'center' : 'right', vertical: 'middle' };
        });
        row.height = 22;
        siguiente++;
      }
      ws.mergeCells(siguiente + 1, 1, siguiente + 1, n);
      const nota = ws.getCell(siguiente + 1, 1);
      nota.value = 'Documento generado automáticamente por el sistema PLUSTWENTY. Uso interno; no constituye comprobante de pago tributario.';
      nota.font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF9CA3AF' } };

      if (filas.length) ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: ultima, column: n } };
      ws.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`;
      ws.headerFooter.oddFooter = '&L&8PLUSTWENTY · Academia Preuniversitaria&C&8Página &P de &N&R&8&D';

      if (resumen) {
        const rs = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
        const m = resumen.encabezados.length;
        rs.columns = resumen.encabezados.map((_, i) => ({ width: i === 0 ? 34 : 18 }));
        rs.mergeCells(1, 1, 1, m);
        rs.getCell(1, 1).value = ACADEMIA.nombre.toUpperCase();
        rs.getCell(1, 1).font = { name: 'Calibri', size: 15, bold: true, color: { argb: NAVY } };
        rs.getRow(1).height = 26;
        rs.mergeCells(2, 1, 2, m);
        rs.getCell(2, 1).value = `${resumen.titulo}  ·  Periodo: ${periodo}`;
        rs.getCell(2, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: AZUL } };
        const hr = rs.getRow(4);
        resumen.encabezados.forEach((h, i) => {
          const c = hr.getCell(i + 1);
          c.value = h;
          c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
          c.border = bordes;
        });
        hr.height = 22;
        resumen.filas.forEach((f, r) => {
          const row = rs.getRow(5 + r);
          f.forEach((v, i) => {
            const c = row.getCell(i + 1);
            c.value = v;
            c.numFmt = FORMATO[resumen.tipos[i]] || '@';
            c.font = { name: 'Calibri', size: 10, bold: !!resumen.ultimaEsTotal && r === resumen.filas.length - 1 };
            c.border = bordes;
            c.alignment = { horizontal: i === 0 ? 'left' : (resumen.tipos[i] === 'dinero' ? 'right' : 'center') };
            if (r % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
          });
        });
      }

      const buffer = await wb.xlsx.writeBuffer();
      return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
  };

  /* Automatismos: preparan formularios nuevos y paginan tablas nuevas cada vez que cambia el DOM. */
  function iniciarAutomatismos() {
    // Ojito de mora (en cualquier tabla): muestra el desglose de la mora de esa cuota.
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-mora]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      UI.moraDetalle(b.dataset.mora, b.dataset.moraFecha || undefined);
    }, true);
    Forms.instalar();
    // El observador corre como microtarea justo después de cada cambio del DOM (antes de que el usuario pueda hacer clic).
    const correr = () => { Forms.scan(); Pager.scan(); };
    new MutationObserver(correr).observe(document.body, { childList: true, subtree: true });
    correr();
  }
  iniciarAutomatismos();

  /* ------------------------------------------------------------------
     Inicialización y API pública
     ------------------------------------------------------------------ */
  // Errores de la API: se muestran en una alerta (o se redirige al login si la sesión expiró)
  const mostrarErrorApi = err => {
    if (!(err instanceof ApiError)) return false;
    const enLogin = !!document.getElementById('login-form');
    if (err.status === 401 && !enLogin) { location.replace('index.html'); return true; }
    if (global.Swal) Swal.fire({ icon: 'error', title: 'No se pudo completar la operación', text: err.message, confirmButtonText: 'Entendido' });
    else alert(err.message);
    return true;
  };
  window.addEventListener('error', e => { if (mostrarErrorApi(e.error)) e.preventDefault(); });
  window.addEventListener('unhandledrejection', e => { if (mostrarErrorApi(e.reason)) e.preventDefault(); });

  // La pantalla de acceso no necesita descargar las colecciones antes de entrar.
  if (!document.getElementById('login-form')) hydrate();

  global.PT = {
    ACADEMIA, MESES, LOGO_SVG,
    db, finance, auth, audit, notify, notifyEstudiante, nextCounter, notificaciones, revisionPagos, registroMatriculas, registroEstudiantes,
    UI, Shell, docs, validators, resetDemo, fakeVoucher, RULES, Pila, Cola, Forms, Pager, excel, Cargando,
    fmt: { money, date: fmtDate, dateTime: fmtDateTime, timeAgo, esc, initials, today, nowISO, addDays, daysBetween, round2, sum, parseDate, toISO, pad, norm, debounce, uid, randomPassword, MESES }
  };
})(window);