/* =====================================================================
   PLUSTWENTY · admin.js
   Lógica del panel de administración (9 módulos completos SPA):
   1. Dashboard (KPIs globales, gráficos Chart.js, últimos pagos)
   2. Gestión de Matrículas (CRUD, filtros, activación/desactivación, obligaciones)
   3. Gestión de Estudiantes (CRUD sin eliminación, búsqueda, modal 360°)
   4. Gestión de Pensiones (cronogramas de pago, cuotas individuales, vencimientos)
   5. Verificación de Pagos (aprobar, rechazar con motivo, caja en efectivo, visor)
   6. Reportes (ingresos, morosidad, matrículas; exportación Excel y print PDF)
   7. Gestión de Usuarios y Roles (creación, vinculación, reseteo de claves)
   8. Configuración Académica (ABM programas y ciclos con tarifas y cuotas)
   9. Auditoría (logs del sistema de solo lectura)
   ===================================================================== */

(function () {
  'use strict';

  const { db, finance, auth, audit, notifyEstudiante, UI, Shell, docs, fmt, validators, RULES, Pila, Cola, Pager } = window.PT;
  const admin = auth.require('admin');
  if (!admin) return;

  /* Helper para badges en sidebar y topbar */
  function updatePendingBadge() {
    const pendientes = db.where('pagos', p => p.estado === 'Pendiente').length;
    const txt = pendientes > 0 ? String(pendientes) : '';
    const elSide = document.getElementById('nav-badge-pagos');
    const elTop = document.getElementById('top-badge-pagos');
    if (elSide) elSide.textContent = txt;
    if (elTop) elTop.textContent = txt;
  }


  /* ------------------------------------------------------------------
     Buscador de estudiantes con autocompletado (DNI, apellidos o nombres)
     Reemplaza al <select> con todos los estudiantes. Mantiene un
     <input type="hidden" name="..."> con el id elegido y dispara "change".
     ------------------------------------------------------------------ */
  const Buscador = (() => {
    const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // Tipos de búsqueda disponibles: de dónde salen los datos y cómo se muestran/buscan
    const TIPOS = {
      estudiante: {
        placeholder: 'Escriba DNI, apellidos o nombres...',
        vacio: 'Sin resultados. Pruebe con otro DNI, apellido o nombre.',
        items: todos => db.all('estudiantes').filter(e => todos || e.activo),
        etiqueta: e => `${e.nombres} ${e.apellidos} (DNI: ${e.dni})`,
        texto: e => `${e.dni} ${e.nombres} ${e.apellidos} ${e.apellidos} ${e.nombres}`,
        titulo: e => `${fmt.esc(e.apellidos)}, ${fmt.esc(e.nombres)}`,
        detalle: e => `DNI ${fmt.esc(e.dni)}`
      },
      programa: {
        placeholder: 'Escriba el nombre o las siglas del programa...',
        vacio: 'Sin resultados. Pruebe con otro nombre o siglas.',
        items: todos => db.all('programas').filter(p => todos || p.activo),
        etiqueta: p => `${p.nombre} (${p.siglas})`,
        texto: p => `${p.nombre} ${p.siglas}`,
        titulo: p => fmt.esc(p.nombre),
        detalle: p => fmt.esc(p.siglas)
      },
      // Ciclos: se encuentran por siglas, nombre de la universidad/programa, nombre del ciclo o modalidad
      ciclo: {
        placeholder: 'Escriba siglas, universidad o ciclo (ej. UNT 2026-I)...',
        vacio: 'Sin resultados. Pruebe con otras siglas, universidad o ciclo.',
        items: todos => db.all('ciclos').filter(c => todos || c.activo),
        etiqueta: c => { const p = db.find('programas', c.programaId); return `${p ? (p.siglas || p.nombre) + ' · ' : ''}${c.nombre}`; },
        texto: c => { const p = db.find('programas', c.programaId); return `${p ? p.siglas + ' ' + p.nombre + ' ' : ''}${c.nombre} ${c.modalidad || ''}`; },
        titulo: c => { const p = db.find('programas', c.programaId); return fmt.esc(`${p ? (p.siglas || p.nombre) + ' · ' : ''}${c.nombre}`); },
        detalle: c => { const p = db.find('programas', c.programaId); return fmt.esc(`${p ? p.nombre + ' · ' : ''}${c.modalidad || ''}`); }
      }
    };
    const cfgDe = w => TIPOS[w.dataset.tipo] || TIPOS.estudiante;

    // valor: id preseleccionado · filtro: modo "filtro de tabla" (opcional, incluye inactivos y restaura el texto al salir)
    function html({ tipo = 'estudiante', name = 'estudianteId', id = '', requerido = true, placeholder, valor = '', filtro = false } = {}) {
      const cfg = TIPOS[tipo];
      placeholder = placeholder || cfg.placeholder;
      if (filtro) requerido = false;
      const sel = valor ? cfg.items(true).find(x => x.id === valor) : null;
      return `<div class="est-picker" data-tipo="${tipo}"${filtro ? ' data-filtro' : ''}>
        <input type="text" class="input est-picker-input" autocomplete="off" role="combobox" aria-expanded="false"
               placeholder="${placeholder}" value="${sel ? fmt.esc(cfg.etiqueta(sel)) : ''}" ${requerido ? 'required' : ''}>
        <input type="hidden" name="${name}" ${id ? `id="${id}"` : ''} value="${sel ? sel.id : ''}">
        <div class="est-picker-list" role="listbox" hidden></div>
      </div>`;
    }

    const partes = w => ({
      txt: w.querySelector('.est-picker-input'),
      hid: w.querySelector('input[type=hidden]'),
      list: w.querySelector('.est-picker-list')
    });

    function cerrar(w) {
      const { txt, list } = partes(w);
      list.hidden = true; txt.setAttribute('aria-expanded', 'false');
    }

    function validar(w) {
      const { txt, hid } = partes(w);
      txt.setCustomValidity(txt.value.trim() && !hid.value ? 'Seleccione una opción de la lista de sugerencias.' : '');
    }

    function mostrar(w) {
      const { txt, list } = partes(w);
      const cfg = cfgDe(w);
      const tokens = norm(txt.value).split(/\s+/).filter(Boolean);
      if (!tokens.length) { cerrar(w); return; }   // sin texto: no se muestra la lista
      const hallados = cfg.items(w.hasAttribute('data-filtro')).filter(e => {
        const hay = norm(cfg.texto(e));
        return tokens.every(t => hay.includes(t));
      });
      const visibles = hallados.slice(0, 8);
      list.innerHTML = visibles.length
        ? visibles.map((e, i) => `<div class="est-picker-item${i === 0 ? ' active' : ''}" role="option" data-id="${e.id}">
            <span class="est-picker-name">${cfg.titulo(e)}</span>
            <span class="est-picker-dni">${cfg.detalle(e)}</span></div>`).join('') +
          (hallados.length > visibles.length ? `<div class="est-picker-more">${hallados.length - visibles.length} más… siga escribiendo para filtrar</div>` : '')
        : `<div class="est-picker-empty">${cfg.vacio}</div>`;
      list.hidden = false; txt.setAttribute('aria-expanded', 'true');
    }

    function elegir(w, id) {
      const cfg = cfgDe(w);
      const e = cfg.items(w.hasAttribute('data-filtro')).find(x => x.id === id);
      if (!e) return;
      const { txt, hid } = partes(w);
      txt.value = cfg.etiqueta(e);
      hid.value = e.id;
      validar(w);
      cerrar(w);
      hid.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function mover(w, dir) {
      const items = [...w.querySelectorAll('.est-picker-item')];
      if (!items.length) return;
      let i = items.findIndex(x => x.classList.contains('active'));
      items[i]?.classList.remove('active');
      i = (i + dir + items.length) % items.length;
      items[i].classList.add('active');
      items[i].scrollIntoView({ block: 'nearest' });
    }

    // Delegación de eventos: funciona en cualquier modal sin inicializar nada
    document.addEventListener('input', ev => {
      const txt = ev.target.closest?.('.est-picker-input');
      if (!txt) return;
      const w = txt.closest('.est-picker');
      const { hid } = partes(w);
      // En un filtro, la selección solo se quita al vaciar el cuadro (evita recargar la tabla mientras se escribe)
      if (hid.value && (!w.hasAttribute('data-filtro') || !txt.value.trim())) {
        hid.value = ''; hid.dispatchEvent(new Event('change', { bubbles: true }));
      }
      validar(w);
      mostrar(w);
    });
    document.addEventListener('click', ev => {
      const txt = ev.target.closest?.('.est-picker-input');
      if (txt && txt.value.trim() && !partes(txt.closest('.est-picker')).hid.value) mostrar(txt.closest('.est-picker'));
    });
    document.addEventListener('keydown', ev => {
      const txt = ev.target.closest?.('.est-picker-input');
      if (!txt) return;
      const w = txt.closest('.est-picker');
      const { list } = partes(w);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (list.hidden) mostrar(w); else mover(w, 1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); mover(w, -1); }
      else if (ev.key === 'Enter' && !list.hidden) {
        ev.preventDefault();
        const a = w.querySelector('.est-picker-item.active');
        if (a) elegir(w, a.dataset.id);
      } else if (ev.key === 'Escape' && !list.hidden) { ev.stopPropagation(); cerrar(w); }
    });
    document.addEventListener('focusout', ev => {
      const txt = ev.target.closest?.('.est-picker-input');
      const w = txt?.closest('.est-picker');
      if (!w || !w.hasAttribute('data-filtro')) return;
      const cfg = cfgDe(w);
      const { hid } = partes(w);
      const sel = hid.value ? cfg.items(true).find(x => x.id === hid.value) : null;
      txt.value = sel ? cfg.etiqueta(sel) : '';
      validar(w); cerrar(w);
    });
    document.addEventListener('mousedown', ev => {
      const item = ev.target.closest?.('.est-picker-item');
      if (item) { ev.preventDefault(); elegir(item.closest('.est-picker'), item.dataset.id); return; }
      document.querySelectorAll('.est-picker').forEach(w => { if (!w.contains(ev.target)) cerrar(w); });
    });

    return { html };
  })();

  /* ------------------------------------------------------------------
     1. DASHBOARD
     ------------------------------------------------------------------ */
  const DashboardView = {
    title: 'Dashboard General',
    subtitle: 'Resumen financiero, métricas académicas y operaciones en curso',
    render() {
      const estudiantes = db.all('estudiantes');
      const matriculas = db.all('matriculas');
      const matriculasActivas = matriculas.filter(m => m.estado === 'Activa').length;
      const pagos = db.all('pagos');
      const pensiones = db.all('pensiones').filter(p => !p.anulada);

      // Ingresos confirmados (pagos aprobados)
      const totalIngresos = fmt.sum(pagos.filter(p => p.estado === 'Aprobado'), p => p.monto);

      // Pagos reportados pendientes de validación
      const pagosPendientes = pagos.filter(p => p.estado === 'Pendiente');
      const totalEnRevision = fmt.sum(pagosPendientes, p => p.monto);

      // Saldo total pendiente por cobrar (según regla de negocio)
      const saldoTotalPendiente = fmt.sum(pensiones, p => {
        const inf = finance.info(p, pagos);
        return inf.saldo + inf.mora;
      });
      const moraTotal = fmt.sum(pensiones, p => finance.info(p, pagos).mora);

      // Morosidad
      const vencidas = pensiones.map(p => finance.info(p, pagos)).filter(p => p.estado === 'Vencida');
      const montoVencido = fmt.sum(vencidas, p => p.saldo + p.mora);

      // Cuotas vencidas con mayor deuda (deuda = saldo + mora), las 6 más altas
      const topVencidas = vencidas.slice().sort((a, b) => (b.saldo + b.mora) - (a.saldo + a.mora)).slice(0, 6);

      return `
        <div class="stagger space-y-6">
          <!-- KPIs -->
          <div class="kpi-grid">
            ${UI.kpi({ icon: 'fa-user-graduate', label: 'Estudiantes Registrados', value: estudiantes.length, hint: `${estudiantes.filter(e => e.activo).length} activos`, tone: 'navy' })}
            ${UI.kpi({ icon: 'fa-id-card-clip', label: 'Matrículas Activas', value: matriculasActivas, hint: `de ${matriculas.length} registradas`, tone: 'blue' })}
            ${UI.kpi({ icon: 'fa-circle-dollar-to-slot', label: 'Ingresos Confirmados', value: fmt.money(totalIngresos), hint: 'Pagos aprobados en caja/bancos', tone: 'green' })}
            ${UI.kpi({ icon: 'fa-hand-holding-dollar', label: 'Saldo por Cobrar', value: fmt.money(saldoTotalPendiente), hint: `${vencidas.length} cuotas vencidas (${fmt.money(montoVencido)})${moraTotal > 0 ? ` · incl. mora ${fmt.money(moraTotal)}` : ''}`, tone: 'amber' })}
          </div>

          ${pagosPendientes.length > 0 ? `
            <div class="alert alert-warning flex items-center justify-between">
              <div class="flex items-center gap-3">
                <i class="fa-solid fa-bell text-amber-600 text-xl"></i>
                <div>
                  <p class="font-bold">Hay ${pagosPendientes.length} pago(s) reportados por Yape/Plin pendientes de revisión (${fmt.money(totalEnRevision)})</p>
                  <p class="text-xs text-amber-800">Recuerde que no reducen la deuda ni ingresan a finanzas hasta ser aprobados.</p>
                </div>
              </div>
              <button class="btn btn-primary btn-sm" data-go="pagos">Revisar ahora</button>
            </div>
          ` : ''}

          <!-- Gráficos -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="card lg:col-span-2">
              <div class="card-head">
                <div>
                  <h3 class="card-title"><i class="fa-solid fa-chart-column"></i> Recaudación por Programa Académico</h3>
                  <p class="card-sub">Comparación entre ingresos cobrados vs saldo pendiente</p>
                </div>
              </div>
              <div class="relative h-72">
                <canvas id="chart-programas"></canvas>
              </div>
            </div>

            <div class="card">
              <div class="card-head">
                <div>
                  <h3 class="card-title"><i class="fa-solid fa-chart-pie"></i> Estado de Pensiones</h3>
                  <p class="card-sub">Distribución del cronograma 2026</p>
                </div>
              </div>
              <div class="relative h-72 flex items-center justify-center">
                <canvas id="chart-estados"></canvas>
              </div>
            </div>
          </div>

          <!-- Cuotas vencidas: lo que el administrador debe gestionar primero -->
          <div class="card">
            <div class="card-head">
              <div>
                <h3 class="card-title"><i class="fa-solid fa-triangle-exclamation"></i> Cuotas Vencidas por Cobrar</h3>
                <p class="card-sub">Las ${topVencidas.length || 6} mayores deudas vencidas (saldo + mora) para dar seguimiento</p>
              </div>
              <button class="btn btn-secondary btn-sm" data-go="reportes">Ver reporte de morosidad</button>
            </div>
            ${topVencidas.length === 0 ? UI.empty('No hay cuotas vencidas. Todo al día.', 'fa-circle-check') : UI.table({
              cols: [
                { label: 'Estudiante' },
                { label: 'Concepto' },
                { label: 'Vencimiento' },
                { label: 'Días de atraso', cls: 'num' },
                { label: 'Saldo', cls: 'num' },
                { label: 'Mora', cls: 'num' },
                { label: 'Total a cobrar', cls: 'num' },
                { label: 'Acción', cls: 'nowrap text-right' }
              ],
              rows: topVencidas.map(p => {
                const est = db.find('estudiantes', p.estudianteId);
                return [
                  `<div><p class="font-bold text-slate-800">${fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—')}</p><p class="text-xs text-slate-400">DNI ${est?.dni || ''}</p></div>`,
                  `<span class="text-xs font-semibold">${fmt.esc(p.concepto)}</span>`,
                  `<span class="text-xs font-semibold">${fmt.date(p.fechaVencimiento)}</span>`,
                  `<span class="font-bold text-red-600">${p.diasAtraso} ${p.diasAtraso === 1 ? 'día' : 'días'}</span>`,
                  fmt.money(p.saldo),
                  p.mora > 0 ? `<span class="text-amber-600 font-semibold">${fmt.money(p.mora)}</span>` : '—',
                  `<span class="font-extrabold text-slate-800">${fmt.money(p.saldo + p.mora)}</span>`,
                  `<div class="actions"><button class="btn btn-secondary btn-sm" data-dash-student="${p.estudianteId}" title="Ver expediente del estudiante"><i class="fa-solid fa-eye"></i></button></div>`
                ];
              })
            })}
          </div>
        </div>
      `;
    },
    mount(params, root) {
      // Gráfico de programas
      const programas = db.all('programas');
      const matriculas = db.all('matriculas');
      const pensiones = db.all('pensiones').filter(p => !p.anulada);
      const pagos = db.all('pagos');

      const labels = [];
      const dataCobrado = [];
      const dataPendiente = [];

      programas.forEach(prg => {
        labels.push(prg.siglas || prg.nombre);
        const matsPrg = matriculas.filter(m => m.programaId === prg.id).map(m => m.id);
        const pensPrg = pensiones.filter(p => matsPrg.includes(p.matriculaId));
        let cobrado = 0;
        let pendiente = 0;
        pensPrg.forEach(pen => {
          const inf = finance.info(pen, pagos);
          cobrado += inf.abonado;
          pendiente += inf.saldo;
        });
        dataCobrado.push(cobrado);
        dataPendiente.push(pendiente);
      });

      Shell.chart('chart-programas', {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Cobrado (Aprobado)', data: dataCobrado, backgroundColor: '#10B981', borderRadius: 8 },
            { label: 'Saldo Pendiente', data: dataPendiente, backgroundColor: '#3B82F6', borderRadius: 8 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: {
            x: { grid: { display: false } },
            y: { ticks: { callback: v => 'S/ ' + v } }
          }
        }
      });

      // Gráfico de estado de pensiones
      const todasInfo = pensiones.map(p => finance.info(p, pagos));
      const nPagadas = todasInfo.filter(p => p.estado === 'Pagada').length;
      const nParciales = todasInfo.filter(p => p.estado === 'Parcial').length;
      const nPendientes = todasInfo.filter(p => p.estado === 'Pendiente').length;
      const nVencidas = todasInfo.filter(p => p.estado === 'Vencida').length;

      Shell.chart('chart-estados', {
        type: 'doughnut',
        data: {
          labels: ['Pagadas', 'Parciales', 'Pendientes', 'Vencidas'],
          datasets: [{
            data: [nPagadas, nParciales, nPendientes, nVencidas],
            backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'],
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          cutout: '68%'
        }
      });

      // Eventos de botones rápidos
      root.addEventListener('click', async e => {
        const btnE = e.target.closest('[data-dash-student]');
        if (btnE) { Shell.go('estudiantes', { id: btnE.dataset.dashStudent }); return; }
        const btnV = e.target.closest('[data-preview-voucher]');
        if (btnV) {
          const pg = db.find('pagos', btnV.dataset.previewVoucher);
          if (pg?.comprobante) UI.viewImage(pg.comprobante, `Comprobante Op. ${pg.numeroOperacion}`);
          return;
        }
        const btnA = e.target.closest('[data-quick-approve]');
        if (btnA) {
          await Actions.aprobarPago(btnA.dataset.quickApprove);
          Shell.refresh();
          return;
        }
        const btnR = e.target.closest('[data-quick-reject]');
        if (btnR) {
          await Actions.rechazarPago(btnR.dataset.quickReject);
          Shell.refresh();
          return;
        }
        const btnP = e.target.closest('[data-print-recibo]');
        if (btnP) {
          docs.printRecibo(btnP.dataset.printRecibo);
        }
      });
    }
  };

  /* Etiqueta "incluye mora": el portal del estudiante la deja escrita en `observacion` del pago. */
  function moraChip(p) {
    const m = String((p && p.observacion) || '').match(/Incluye mora de (S\/\s?[\d.,]+)/);
    return m ? `<span class="ocr-chip mora-chip" title="El monto incluye recargo por pago atrasado"><i class="fa-solid fa-clock"></i> incl. mora ${m[1]}</span>` : '';
  }

  /* Acciones compartidas de pagos (utilizadas en Dashboard y Verificación de Pagos) */
  const Actions = {
    async aprobarPago(pagoId) {
      const pg = db.find('pagos', pagoId);
      if (!pg) return;
      const pen = db.find('pensiones', pg.pensionId);
      const est = db.find('estudiantes', pg.estudianteId);
      const ok = await UI.confirm({
        title: '¿Aprobar pago reportado?',
        html: `Se validará el abono de <b>${fmt.money(pg.monto)}</b> por método <b>${pg.metodo}</b> (Op. ${pg.numeroOperacion}) para <b>${fmt.esc(est?.nombres || '')} ${fmt.esc(est?.apellidos || '')}</b>.${moraChip(pg) ? `<br><br>${moraChip(pg)}` : ''}<br><br>Se emitirá el recibo interno y se actualizará el saldo de la obligación.`,
        confirmText: 'Sí, aprobar pago',
        icon: 'question'
      });
      if (!ok) return;

      // Una sola llamada: el servidor aprueba, emite recibo, notifica y audita en una transacción.
      const saved = await window.PT.Cargando.ejecutar(() => window.PT.revisionPagos.aprobar(pagoId), 'Aprobando pago…');
      UI.toast(`Pago aprobado. Recibo generado: ${saved.reciboNumero}`, 'success');
      updatePendingBadge();
    },

    async rechazarPago(pagoId) {
      const pg = db.find('pagos', pagoId);
      if (!pg) return;
      const est = db.find('estudiantes', pg.estudianteId);
      const r = await UI.reason({
        title: 'Rechazar Pago Reportado',
        text: `Indique detalladamente el motivo del rechazo del comprobante de ${fmt.money(pg.monto)} (Op: ${pg.numeroOperacion}). Este mensaje llegará al estudiante/apoderado:`,
        placeholder: 'Ejemplo: El número de operación no coincide con el voucher o el monto transferido es menor al reportado...',
        confirmText: 'Rechazar comprobante',
        danger: true,
        icon: 'warning'
      });
      if (!r || !r.motivo) return;

      // Una sola llamada: el servidor rechaza, notifica y audita en una transacción.
      await window.PT.Cargando.ejecutar(() => window.PT.revisionPagos.rechazar(pagoId, r.motivo), 'Rechazando pago…');
      UI.toast('Pago rechazado y notificado al estudiante', 'info');
      updatePendingBadge();
    }
  };

  /* ------------------------------------------------------------------
     2. GESTIÓN DE MATRÍCULAS
     ------------------------------------------------------------------ */
  const MatriculasView = {
    title: 'Gestión de Matrículas',
    subtitle: 'Registro de matrículas por ciclo, control de estado y generación de cronograma',
    render(params) {
      const programas = db.all('programas');
      const ciclos = db.all('ciclos');
      const matriculas = db.all('matriculas').slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
      const estudiantes = db.all('estudiantes');

      const prgFiltro = params.prg || '';
      const cicFiltro = params.cic || '';
      const estFiltro = params.estado || '';
      const busqueda = (params.q || '').toLowerCase();

      const filtradas = matriculas.filter(m => {
        if (prgFiltro && m.programaId !== prgFiltro) return false;
        if (cicFiltro && m.cicloId !== cicFiltro) return false;
        if (estFiltro && m.estado !== estFiltro) return false;
        if (busqueda) {
          const est = estudiantes.find(e => e.id === m.estudianteId);
          const t = `${m.codigo} ${est?.nombres} ${est?.apellidos} ${est?.dni}`.toLowerCase();
          if (!t.includes(busqueda)) return false;
        }
        return true;
      });

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Padrón de Matrículas</h3>
              <p class="page-desc">Total registradas: ${matriculas.length} | Activas: ${matriculas.filter(m => m.estado === 'Activa').length}</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" id="btn-nueva-mat">
                <i class="fa-solid fa-plus"></i> Nueva Matrícula
              </button>
            </div>
          </div>

          <!-- Filtros -->
          <div class="filters" style="--fcols:3">
            <div class="input-icon">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" id="filtro-mat-q" class="input" placeholder="Buscar por código, DNI o estudiante..." value="${fmt.esc(params.q || '')}">
            </div>
            ${Buscador.html({ tipo: 'programa', name: 'prg', id: 'filtro-mat-prg', filtro: true, valor: prgFiltro, placeholder: 'Todos los programas (escriba nombre o siglas)' })}
            <select id="filtro-mat-cic" class="select">
              <option value="">Todos los ciclos</option>
              ${ciclos.map(c => { const pr = db.find('programas', c.programaId); return `<option value="${c.id}" ${cicFiltro === c.id ? 'selected' : ''}>${fmt.esc((pr ? (pr.siglas || pr.nombre) + ' · ' : '') + c.nombre)}</option>`; }).join('')}
            </select>
            <select id="filtro-mat-est" class="select">
              <option value="">Todos los estados</option>
              <option value="Activa" ${estFiltro === 'Activa' ? 'selected' : ''}>Activas</option>
              <option value="Inactiva" ${estFiltro === 'Inactiva' ? 'selected' : ''}>Inactivas</option>
            </select>
          </div>

          <!-- Tabla -->
          ${filtradas.length === 0 ? UI.empty('No se encontraron matrículas con los filtros aplicados.') : UI.table({
            cols: [
              { label: 'Código Matrícula' },
              { label: 'Estudiante' },
              { label: 'Programa / Ciclo' },
              { label: 'Fecha' },
              { label: 'Costo Matrícula', cls: 'num' },
              { label: 'Estado' },
              { label: 'Acciones', cls: 'nowrap text-right' }
            ],
            rows: filtradas.map(m => {
              const est = db.find('estudiantes', m.estudianteId);
              const cic = db.find('ciclos', m.cicloId);
              const prg = db.find('programas', m.programaId);
              const isActive = m.estado === 'Activa';

              return [
                `<span class="font-extrabold text-navy">${fmt.esc(m.codigo)}</span>`,
                `<div>
                  <a href="#estudiantes?id=${m.estudianteId}" class="font-bold text-slate-800 hover:text-brand">${fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—')}</a>
                  <p class="text-xs text-slate-400">DNI ${est?.dni || '—'}</p>
                </div>`,
                `<div>
                  <p class="font-semibold text-slate-800">${fmt.esc(prg?.nombre || '—')}</p>
                  <p class="text-xs text-slate-500">${fmt.esc(cic?.nombre || '—')} (${cic?.modalidad || ''})</p>
                </div>`,
                `<span class="text-xs font-semibold">${fmt.date(m.fecha)}</span>`,
                `<span class="font-bold">${fmt.money(m.montoMatricula)}</span>`,
                UI.badge(m.estado),
                `<div class="actions">
                  <button class="btn btn-secondary btn-sm" data-edit-mat="${m.id}" title="Editar matrícula"><i class="fa-solid fa-pen-to-square"></i></button>
                  <button class="btn ${isActive ? 'btn-soft-danger' : 'btn-soft-success'} btn-sm" data-toggle-mat="${m.id}" title="${isActive ? 'Desactivar matrícula' : 'Activar matrícula'}">
                    <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-check'}"></i>
                    <span>${isActive ? 'Desactivar' : 'Activar'}</span>
                  </button>
                </div>`
              ];
            })
          })}
        </div>
      `;
    },
    mount(params, root) {
      const applyFilters = () => {
        Shell.go('matriculas', {
          q: document.getElementById('filtro-mat-q').value.trim(),
          prg: document.getElementById('filtro-mat-prg').value,
          cic: document.getElementById('filtro-mat-cic').value,
          estado: document.getElementById('filtro-mat-est').value
        });
      };

      document.getElementById('filtro-mat-q').addEventListener('input', fmt.debounce(applyFilters, 300));
      document.getElementById('filtro-mat-prg').addEventListener('change', applyFilters);
      document.getElementById('filtro-mat-cic').addEventListener('change', applyFilters);
      document.getElementById('filtro-mat-est').addEventListener('change', applyFilters);

      document.getElementById('btn-nueva-mat')?.addEventListener('click', () => MatriculasView.modalCrear());

      root.addEventListener('click', async e => {
        const btnEdit = e.target.closest('[data-edit-mat]');
        if (btnEdit) {
          MatrasEdit(btnEdit.dataset.editMat);
          return;
        }
        const btnToggle = e.target.closest('[data-toggle-mat]');
        if (btnToggle) {
          const mat = db.find('matriculas', btnToggle.dataset.toggleMat);
          if (!mat) return;
          const nuevoEstado = mat.estado === 'Activa' ? 'Inactiva' : 'Activa';

          const r = await UI.reason({
            title: `¿${nuevoEstado === 'Inactiva' ? 'Desactivar' : 'Activar'} matrícula ${mat.codigo}?`,
            text: `Regla de negocio: las matrículas no se eliminan para conservar la trazabilidad histórica. Ingrese el motivo de este cambio:`,
            placeholder: 'Motivo del cambio de estado (ej: Retiro voluntario, cambio de sede, reincorporación)...',
            danger: nuevoEstado === 'Inactiva',
            confirmText: `Confirmar (${nuevoEstado})`
          });
          if (!r || !r.motivo) return;

          db.update('matriculas', mat.id, {
            estado: nuevoEstado,
            observacion: r.motivo
          });

          audit(`Cambió estado de matrícula ${mat.codigo} a ${nuevoEstado}`, 'Gestión de Matrículas', `Motivo: ${r.motivo}`);
          UI.toast(`Matrícula marcada como ${nuevoEstado}`, 'success');
          Shell.refresh();
        }
      });
    },

    modalCrear() {
      const programas = db.all('programas').filter(p => p.activo);
      const ciclos = db.all('ciclos').filter(c => c.activo);
      const estudiantes = db.all('estudiantes').filter(e => e.activo);

      const html = `
        <form id="form-nueva-mat" class="space-y-4">
          <div class="field">
            <label class="label">Estudiante <span class="text-red-500">*</span></label>
            ${Buscador.html({  })}
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Programa Académico <span class="text-red-500">*</span></label>
              ${Buscador.html({ tipo: 'programa', name: 'programaId', id: 'mat-modal-prg' })}
            </div>
            <div class="field">
              <label class="label">Ciclo Académico <span class="text-red-500">*</span></label>
              <select name="cicloId" id="mat-modal-cic" class="select" required>
                <option value="">Primero elija programa...</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Fecha de Matrícula</label>
              <input type="date" name="fecha" class="input" value="${fmt.today()}" min="${fmt.addDays(fmt.today(), -365)}" max="${fmt.addDays(fmt.today(), 365)}" required>
            </div>
            <div class="field">
              <label class="label">Monto de Matrícula (S/)</label>
              <input type="number" step="0.01" name="montoMatricula" id="mat-modal-monto" class="input font-bold bg-slate-50 cursor-not-allowed" placeholder="Elija el ciclo" readonly tabindex="-1" required>
              <p class="text-xs text-slate-400 mt-1">Monto fijo definido en la configuración del ciclo.</p>
            </div>
          </div>

          <div class="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs text-blue-800 space-y-1">
            <p class="font-bold"><i class="fa-solid fa-circle-info"></i> Generación automática de obligaciones:</p>
            <p>Al confirmar la matrícula se generará automáticamente el cargo de Matrícula y el cronograma de pensiones mensuales según las cuotas definidas para el ciclo.</p>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Registrar Matrícula</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: 'Nueva Matrícula de Estudiante',
        subtitle: 'Asignación de programa, ciclo y generación de pensiones',
        icon: 'fa-file-signature',
        body: html,
        size: 'md'
      });
      UI.initSearchSelect();

      const selPrg = document.getElementById('mat-modal-prg');
      const selCic = document.getElementById('mat-modal-cic');
      const inMonto = document.getElementById('mat-modal-monto');

      selPrg.addEventListener('change', () => {
        const prgId = selPrg.value;
        const cicDisponibles = ciclos.filter(c => c.programaId === prgId);
        selCic.innerHTML = '<option value="">Seleccione ciclo...</option>' +
          cicDisponibles.map(c => `<option value="${c.id}" data-mat="${c.matricula}" data-pen="${c.pension}">${fmt.esc(c.nombre)} (${c.modalidad}) - Matrícula: S/ ${c.matricula}</option>`).join('');
      });

      selCic.addEventListener('change', () => {
        const opt = selCic.selectedOptions[0];
        inMonto.value = (opt && opt.dataset.mat) ? opt.dataset.mat : '';
      });

      document.getElementById('form-nueva-mat').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const estId = fd.get('estudianteId');
        const cicloId = fd.get('cicloId');
        const programaId = fd.get('programaId');
        const fecha = fd.get('fecha');

        const ciclo = db.find('ciclos', cicloId);
        const est = db.find('estudiantes', estId);
        if (!est) return UI.toast('Seleccione un estudiante de la lista');
        if (!ciclo) return UI.toast('Seleccione el programa y el ciclo');
        const monto = Number(ciclo.matricula) || 0;   // fijo: siempre el monto del ciclo, no el del formulario

        // Una sola llamada: el servidor crea la matrícula + cronograma, actualiza al estudiante,
        // notifica y audita en una transacción (antes eran ~6 llamadas en fila).
        const saved = window.PT.registroMatriculas.registrar({
          estudianteId: estId,
          cicloId,
          programaId,
          fecha,
          montoMatricula: monto
        });
        UI.closeModal();
        UI.toast(`Matrícula ${saved.codigo} creada exitosamente con sus pensiones`);
        Shell.refresh();
      });
    }
  };

  function MatrasEdit(matId) {
    const mat = db.find('matriculas', matId);
    if (!mat) return;
    const est = db.find('estudiantes', mat.estudianteId);
    const cic = db.find('ciclos', mat.cicloId);

    const html = `
      <form id="form-edit-mat" class="space-y-4">
        <div>
          <p class="text-sm font-bold text-slate-800">${fmt.esc(est?.nombres)} ${fmt.esc(est?.apellidos)}</p>
          <p class="text-xs text-slate-500">Matrícula: <b>${mat.codigo}</b> | Ciclo: <b>${cic?.nombre || ''}</b></p>
        </div>

        <div class="field">
          <label class="label">Fecha de Matrícula</label>
          <input type="date" name="fecha" class="input" value="${mat.fecha}" min="${fmt.addDays(fmt.today(), -1095)}" max="${fmt.addDays(fmt.today(), 365)}" required>
        </div>

        <div class="field">
          <label class="label">Observaciones / Anotaciones</label>
          <textarea name="observacion" data-v="texto" maxlength="200" class="textarea" rows="3">${fmt.esc(mat.observacion || '')}</textarea>
        </div>

        <div class="modal-footer -mx-6 -mb-6 mt-6">
          <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Guardar Cambios</button>
        </div>
      </form>
    `;

    UI.openModal({
      title: `Editar Matrícula ${mat.codigo}`,
      icon: 'fa-pen-to-square',
      body: html,
      size: 'md'
    });

    document.getElementById('form-edit-mat').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      db.update('matriculas', mat.id, {
        fecha: fd.get('fecha'),
        observacion: fd.get('observacion')
      });
      audit(`Editó matrícula ${mat.codigo}`, 'Gestión de Matrículas');
      UI.closeModal();
      UI.toast('Matrícula actualizada');
      Shell.refresh();
    });
  }

  /* ------------------------------------------------------------------
     3. GESTIÓN DE ESTUDIANTES
     ------------------------------------------------------------------ */
  const EstudiantesView = {
    title: 'Gestión de Estudiantes',
    subtitle: 'Padrón general de alumnos, expedientes académicos y resumen financiero 360°',
    render(params) {
      const estudiantes = db.all('estudiantes');
      const programas = db.all('programas');
      const ciclos = db.all('ciclos');
      const busqueda = (params.q || '').toLowerCase();
      const prgFilter = params.prg || '';
      const estadoFilter = params.estado || '';

      const filtrados = estudiantes.filter(e => {
        if (prgFilter && e.programaId !== prgFilter) return false;
        if (estadoFilter === 'activo' && !e.activo) return false;
        if (estadoFilter === 'inactivo' && e.activo) return false;
        if (busqueda) {
          const t = `${e.dni} ${e.nombres} ${e.apellidos} ${e.email} ${e.telefono} ${e.apoderado?.nombre || ''}`.toLowerCase();
          if (!t.includes(busqueda)) return false;
        }
        return true;
      });

      filtrados.sort((a, b) => {
        const da = a.fechaRegistro ? new Date(a.fechaRegistro).getTime() : 0;
        const dbTime = b.fechaRegistro ? new Date(b.fechaRegistro).getTime() : 0;
        if (dbTime !== da) {
          return dbTime - da;
        }
        return String(b.codigo || '').localeCompare(String(a.codigo || ''));
      });

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Padrón de Estudiantes</h3>
              <p class="page-desc">Total registrados: ${estudiantes.length} | Activos: ${estudiantes.filter(e => e.activo).length}</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" id="btn-nuevo-est">
                <i class="fa-solid fa-user-plus"></i> Registrar Estudiante
              </button>
            </div>
          </div>

          <!-- Filtros -->
          <div class="filters" style="--fcols:2">
            <div class="input-icon">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" id="filtro-est-q" class="input" placeholder="Buscar por DNI, nombres, apellidos o apoderado..." value="${fmt.esc(params.q || '')}">
            </div>
            ${Buscador.html({ tipo: 'programa', name: 'prg', id: 'filtro-est-prg', filtro: true, valor: prgFilter, placeholder: 'Todos los programas (escriba nombre o siglas)' })}
            <select id="filtro-est-activo" class="select">
              <option value="">Todos los estados</option>
              <option value="activo" ${estadoFilter === 'activo' ? 'selected' : ''}>Activos</option>
              <option value="inactivo" ${estadoFilter === 'inactivo' ? 'selected' : ''}>Inactivos</option>
            </select>
          </div>

          <!-- Tabla -->
          ${filtrados.length === 0 ? UI.empty('No se encontraron estudiantes.') : UI.table({
            cols: [
              { label: 'DNI / Código' },
              { label: 'Estudiante' },
              { label: 'Programa Actual' },
              { label: 'Contacto' },
              { label: 'Apoderado' },
              { label: 'Estado' },
              { label: 'Acciones', cls: 'nowrap text-right' }
            ],
            rows: filtrados.map(e => {
              const prg = db.find('programas', e.programaId);
              const cic = db.find('ciclos', e.cicloId);
              return [
                `<div>
                  <span class="font-extrabold text-navy font-mono">${fmt.esc(e.dni)}</span>
                  <p class="text-xs text-slate-400">${fmt.esc(e.codigo || '')}</p>
                </div>`,
                `<div>
                  <button type="button" class="font-bold text-slate-800 hover:text-brand text-left" data-view-student="${e.id}">${fmt.esc(e.nombres)} ${fmt.esc(e.apellidos)}</button>
                  <p class="text-xs text-slate-400">${fmt.esc(e.colegio || 'Sin colegio registrado')}</p>
                </div>`,
                `<div>
                  <span class="font-semibold text-slate-800">${fmt.esc(prg?.nombre || '—')}</span>
                  <p class="text-xs text-slate-500">${fmt.esc(cic?.nombre || 'Sin ciclo asignado')}</p>
                </div>`,
                `<div>
                  <p class="text-xs font-semibold text-slate-700"><i class="fa-solid fa-phone text-slate-400 mr-1"></i>${fmt.esc(e.telefono || '—')}</p>
                  <p class="text-xs text-slate-500 truncate max-w-[180px]">${fmt.esc(e.email || '—')}</p>
                </div>`,
                `<div>
                  <p class="text-xs font-semibold text-slate-800">${fmt.esc(e.apoderado?.nombre || '—')}</p>
                  <p class="text-[11px] text-slate-400">${fmt.esc(e.apoderado?.parentesco || 'Apoderado')} · Tel: ${fmt.esc(e.apoderado?.telefono || '—')}</p>
                </div>`,
                UI.badge(e.activo ? 'Activo' : 'Inactivo'),
                `<div class="actions">
                  <button class="btn btn-secondary btn-sm" data-view-student="${e.id}" title="Ver expediente y resumen financiero"><i class="fa-solid fa-folder-open"></i></button>
                  <button class="btn btn-secondary btn-sm" data-edit-student="${e.id}" title="Editar estudiante"><i class="fa-solid fa-user-pen"></i></button>
                </div>`
              ];
            })
          })}
        </div>
      `;
    },
    mount(params, root) {
      if (params.id) {
        setTimeout(() => EstudiantesView.modalExpediente(params.id), 100);
      }

      const applyFilters = () => {
        Shell.go('estudiantes', {
          q: document.getElementById('filtro-est-q').value.trim(),
          prg: document.getElementById('filtro-est-prg').value,
          estado: document.getElementById('filtro-est-activo').value
        });
      };

      document.getElementById('filtro-est-q').addEventListener('input', fmt.debounce(applyFilters, 300));
      document.getElementById('filtro-est-prg').addEventListener('change', applyFilters);
      document.getElementById('filtro-est-activo').addEventListener('change', applyFilters);

      document.getElementById('btn-nuevo-est')?.addEventListener('click', () => EstudiantesView.modalFormulario());

      root.addEventListener('click', async e => {
        const btnView = e.target.closest('[data-view-student]');
        if (btnView) {
          EstudiantesView.modalExpediente(btnView.dataset.viewStudent);
          return;
        }
        const btnEdit = e.target.closest('[data-edit-student]');
        if (btnEdit) {
          EstudiantesView.modalFormulario(btnEdit.dataset.editStudent);
          return;
        }
      });
    },

    modalFormulario(estId = null) {
      const esEdicion = !!estId;
      const est = esEdicion ? db.find('estudiantes', estId) : null;
      const programas = db.all('programas').filter(p => p.activo);
      const ciclos = db.all('ciclos').filter(c => c.activo);

      // Límites de fecha de nacimiento (coherencia): edad entre RULES.edadMin y RULES.edadMax años.
      const fechaHace = anios => { const d = new Date(); d.setFullYear(d.getFullYear() - anios); return fmt.toISO(d); };
      const maxNac = fechaHace(RULES.edadMin), minNac = fechaHace(RULES.edadMax);

      const html = `
        <form id="form-estudiante" class="space-y-4">
          <div class="section-label">Datos Personales del Estudiante</div>
          ${esEdicion ? `
            <div class="alert alert-info text-xs py-2 px-3">
              <i class="fa-solid fa-lock text-brand"></i>
              <span>Por integridad académica, el DNI, nombres completos, apellidos y fecha de nacimiento no son editables tras el registro inicial.</span>
            </div>
          ` : ''}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="field">
              <label class="label">DNI (8 dígitos) ${esEdicion ? '<span class="text-xs text-slate-400 font-normal">(No editable)</span>' : '<span class="text-red-500">*</span>'}</label>
              <input type="text" name="dni" maxlength="8" class="input font-mono" value="${fmt.esc(est?.dni || '')}" ${esEdicion ? 'readonly tabindex="-1"' : 'required'} placeholder="72345678">
            </div>
            <div class="field sm:col-span-2">
              <label class="label">Nombres Completos ${esEdicion ? '<span class="text-xs text-slate-400 font-normal">(No editable)</span>' : '<span class="text-red-500">*</span>'}</label>
              <input type="text" name="nombres" data-v="persona" class="input" value="${fmt.esc(est?.nombres || '')}" ${esEdicion ? 'readonly tabindex="-1"' : 'required'} placeholder="Ej: Valeria Nicole">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Apellidos ${esEdicion ? '<span class="text-xs text-slate-400 font-normal">(No editable)</span>' : '<span class="text-red-500">*</span>'}</label>
              <input type="text" name="apellidos" data-v="persona" class="input" value="${fmt.esc(est?.apellidos || '')}" ${esEdicion ? 'readonly tabindex="-1"' : 'required'} placeholder="Ej: Quispe Huamán">
            </div>
            <div class="field">
              <label class="label">Fecha de Nacimiento ${esEdicion ? '<span class="text-xs text-slate-400 font-normal">(No editable)</span>' : '<span class="text-red-500">*</span>'}</label>
              <input type="date" name="fechaNacimiento" class="input" value="${est?.fechaNacimiento || ''}" min="${minNac}" max="${maxNac}" ${esEdicion ? 'readonly tabindex="-1" style="pointer-events: none;"' : 'required'}>
              ${esEdicion ? '' : `<span class="hint">Edad permitida: de ${RULES.edadMin} a ${RULES.edadMax} años.</span>`}
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Teléfono / Celular <span class="text-red-500">*</span></label>
              <input type="tel" inputmode="numeric" maxlength="9" pattern="\\d{9}" name="telefono" class="input" value="${fmt.esc(est?.telefono || '')}" required placeholder="987654321">
            </div>
            <div class="field">
              <label class="label">Correo Electrónico <span class="text-red-500">*</span></label>
              <input type="email" name="email" class="input" value="${fmt.esc(est?.email || '')}" required placeholder="ejemplo@gmail.com">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Dirección de Residencia</label>
              <input type="text" name="direccion" data-v="direccion" minlength="5" maxlength="120" class="input" value="${fmt.esc(est?.direccion || '')}" placeholder="Av. Universitaria 123">
            </div>
            <div class="field">
              <label class="label">Colegio de Procedencia</label>
              <input type="text" name="colegio" data-v="direccion" minlength="3" maxlength="80" class="input" value="${fmt.esc(est?.colegio || '')}" placeholder="I.E. / Colegio">
            </div>
          </div>

          <div class="section-label mt-4">Datos del Apoderado Responsable</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Nombre del Apoderado <span class="text-red-500">*</span></label>
              <input type="text" name="apo_nombre" data-v="persona" class="input" value="${fmt.esc(est?.apoderado?.nombre || '')}" required placeholder="Nombre completo">
            </div>
            <div class="field">
              <label class="label">DNI Apoderado</label>
              <input type="text" name="apo_dni" maxlength="8" data-differs="dni" data-differs-msg="El DNI del apoderado no puede ser igual al del estudiante." class="input font-mono" value="${fmt.esc(est?.apoderado?.dni || '')}" placeholder="8 dígitos">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Teléfono Apoderado <span class="text-red-500">*</span></label>
              <input type="tel" inputmode="numeric" maxlength="9" pattern="\\d{9}" name="apo_telefono" class="input" value="${fmt.esc(est?.apoderado?.telefono || '')}" required placeholder="987654321">
            </div>
            <div class="field">
              <label class="label">Parentesco</label>
              <select name="apo_parentesco" class="select">
                <option value="Madre" ${est?.apoderado?.parentesco === 'Madre' ? 'selected' : ''}>Madre</option>
                <option value="Padre" ${est?.apoderado?.parentesco === 'Padre' ? 'selected' : ''}>Padre</option>
                <option value="Tutor Legal" ${est?.apoderado?.parentesco === 'Tutor Legal' ? 'selected' : ''}>Tutor Legal</option>
                <option value="Hermano(a)" ${est?.apoderado?.parentesco === 'Hermano(a)' ? 'selected' : ''}>Hermano(a)</option>
              </select>
            </div>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> ${esEdicion ? 'Actualizar Estudiante' : 'Guardar y Registrar'}</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: esEdicion ? `Editar Estudiante: ${est.nombres} ${est.apellidos}` : 'Registrar Nuevo Estudiante',
        subtitle: 'Validación de identidad por DNI único de 8 dígitos',
        icon: esEdicion ? 'fa-user-pen' : 'fa-user-plus',
        body: html,
        size: 'lg'
      });

      const formEst = document.getElementById('form-estudiante');
      formEst?.querySelectorAll('input[name="telefono"], input[name="apo_telefono"]').forEach(inp => {
        inp.addEventListener('input', e => {
          e.target.value = e.target.value.replace(/\D/g, '').slice(0, 9);
        });
      });

      document.getElementById('form-estudiante').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const dni = fd.get('dni').trim();

        if (!validators.dni(dni)) {
          return UI.toast('El DNI debe tener exactamente 8 dígitos numéricos.', 'error');
        }

        // Validación de unicidad de DNI en creación
        if (!esEdicion) {
          const existe = db.all('estudiantes').some(x => x.dni === dni);
          if (existe) {
            return UI.alert('DNI Duplicado', `Ya existe un estudiante registrado con el DNI ${dni}.`, 'error');
          }
        }

        const data = {
          nombres: esEdicion ? est.nombres : fd.get('nombres').trim(),
          apellidos: esEdicion ? est.apellidos : fd.get('apellidos').trim(),
          fechaNacimiento: esEdicion ? est.fechaNacimiento : fd.get('fechaNacimiento'),
          telefono: fd.get('telefono').trim(),
          email: fd.get('email').trim(),
          direccion: fd.get('direccion').trim(),
          colegio: fd.get('colegio').trim(),
          apoderado: {
            nombre: fd.get('apo_nombre').trim(),
            dni: fd.get('apo_dni').trim(),
            telefono: fd.get('apo_telefono').trim(),
            parentesco: fd.get('apo_parentesco')
          }
        };

        if (!validators.phone(data.telefono) || !validators.phone(data.apoderado.telefono)) {
          return UI.alert('Teléfono inválido', 'El teléfono debe tener 9 dígitos y empezar con 9 (celular peruano).', 'error');
        }

        if (!validators.email(data.email)) {
          return UI.alert('Correo inválido', 'Ingresa un correo electrónico válido (debe incluir @ y un dominio, ej. nombre@gmail.com).', 'error');
        }

        if (data.apoderado.dni && !validators.dni(data.apoderado.dni)) {
          return UI.alert('DNI del apoderado inválido', 'El DNI del apoderado debe tener exactamente 8 dígitos numéricos.', 'error');
        }

        if (!esEdicion && !validators.birthdate(data.fechaNacimiento)) {
          return UI.alert('Fecha de nacimiento inválida', `La fecha no puede ser de hoy ni futura, y el estudiante debe tener entre ${RULES.edadMin} y ${RULES.edadMax} años.`, 'error');
        }

        if (esEdicion) {
          db.update('estudiantes', est.id, data);
          const userEst = db.all('users').find(u => u.estudianteId === est.id);
          if (userEst && userEst.email !== data.email) {
            db.update('users', userEst.id, { email: data.email });
          }
          audit(`Actualizó datos de estudiante DNI ${est.dni}`, 'Gestión de Estudiantes');
          UI.toast('Estudiante actualizado exitosamente');
        } else {
          // Una sola llamada: el servidor crea el estudiante + su cuenta de acceso (usuario = DNI) y audita.
          window.PT.registroEstudiantes.registrar({ ...data, dni });
          UI.toast(`Estudiante registrado. Usuario de portal creado: ${dni}`);
        }

        UI.closeModal();
        Shell.refresh();
      });
    },

    modalExpediente(estId) {
      const est = db.find('estudiantes', estId);
      if (!est) return;
      const res = finance.resumen(est.id);
      const prg = db.find('programas', est.programaId);
      const cic = db.find('ciclos', est.cicloId);

      const html = `
        <div class="space-y-6">
          <!-- Cabecera Alumno -->
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div class="flex items-center gap-4">
              <div class="avatar avatar-lg">${fmt.initials(est.nombres + ' ' + est.apellidos)}</div>
              <div>
                <h4 class="text-xl font-extrabold text-navy">${fmt.esc(est.nombres)} ${fmt.esc(est.apellidos)}</h4>
                <p class="text-xs text-slate-500 font-mono">DNI: <b>${est.dni}</b> | Código: <b>${est.codigo}</b></p>
                <p class="text-xs text-brand font-semibold mt-1">
                  <i class="fa-solid fa-graduation-cap"></i> ${fmt.esc(prg?.nombre || 'Sin programa')} · ${fmt.esc(cic?.nombre || 'Sin ciclo')}
                </p>
              </div>
            </div>
            <div>
              ${UI.badge(est.activo ? 'Activo' : 'Inactivo')}
            </div>
          </div>

          <!-- Mini KPIs Financieros -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="mini-stat"><p class="ms-label">Total Exigible</p><p class="ms-value text-slate-800">${fmt.money(res.exigible)}</p></div>
            <div class="mini-stat"><p class="ms-label">Total Pagado</p><p class="ms-value text-emerald-600">${fmt.money(res.totalPagado)}</p></div>
            <div class="mini-stat"><p class="ms-label">Saldo Pendiente</p><p class="ms-value ${res.saldoTotal > 0 ? 'text-amber-600' : 'text-slate-600'}">${fmt.money(res.saldoTotal)}</p>${res.mora > 0 ? `<p class="mora-tag">incl. mora ${fmt.money(res.mora)}</p>` : ''}</div>
            <div class="mini-stat"><p class="ms-label">En Revisión</p><p class="ms-value text-blue-600">${fmt.money(res.enRevision)}</p></div>
          </div>

          <!-- Cronograma de Obligaciones -->
          <div>
            <h5 class="text-sm font-bold text-navy mb-3"><i class="fa-solid fa-calendar-days text-brand"></i> Cronograma de Pensiones y Matrículas</h5>
            ${res.pensiones.length === 0 ? UI.empty('No tiene obligaciones registradas.') : UI.table({
              cols: [
                { label: 'Concepto' },
                { label: 'Vencimiento' },
                { label: 'Importe', cls: 'num' },
                { label: 'Abonado', cls: 'num' },
                { label: 'Saldo', cls: 'num' },
                { label: 'Estado' }
              ],
              rows: res.pensiones.map(p => [
                `<span class="font-bold text-slate-800">${fmt.esc(p.concepto)}</span>`,
                `<span class="text-xs ${p.estado === 'Vencida' ? 'text-red-600 font-bold' : ''}">${fmt.date(p.fechaVencimiento)}</span>`,
                fmt.money(p.importe),
                `<span class="text-emerald-700 font-bold">${fmt.money(p.abonado)}</span>`,
                UI.saldoMora(p),
                UI.badge(p.estado)
              ])
            })}
          </div>

          <!-- Historial de Pagos y Recibos -->
          <div>
            <h5 class="text-sm font-bold text-navy mb-3"><i class="fa-solid fa-receipt text-emerald-600"></i> Pagos Registrados / Recibos Emitidos</h5>
            ${res.pagos.length === 0 ? UI.empty('No hay pagos registrados.') : UI.table({
              cols: [
                { label: 'Fecha' },
                { label: 'Método' },
                { label: 'N° Operación' },
                { label: 'Monto', cls: 'num' },
                { label: 'Estado' },
                { label: 'Recibo' }
              ],
              rows: res.pagos.map(p => [
                fmt.date(p.fechaPago),
                UI.method(p.metodo),
                `<code class="text-xs">${fmt.esc(p.numeroOperacion)}</code>`,
                `<span class="font-bold">${fmt.money(p.monto)}</span>`,
                UI.badge(p.estado),
                p.estado === 'Aprobado' ? `<button class="btn btn-secondary btn-sm" onclick="PT.docs.printRecibo('${p.id}')"><i class="fa-solid fa-print"></i> ${p.reciboNumero}</button>` : '—'
              ])
            })}
          </div>
        </div>
      `;

      UI.openModal({
        title: 'Expediente Académico-Financiero 360°',
        subtitle: `Estudiante: ${est.nombres} ${est.apellidos}`,
        icon: 'fa-id-card',
        body: html,
        size: 'lg'
      });
    }
  };

  /* ------------------------------------------------------------------
     4. GESTIÓN DE PENSIONES
     ------------------------------------------------------------------ */
  const PensionesView = {
    title: 'Gestión de Pensiones',
    subtitle: 'Cronogramas de pago, cuotas individuales y vencimientos',
    render(params) {
      const ciclos = db.all('ciclos');
      const pensiones = db.all('pensiones').filter(p => !p.anulada);
      const pagos = db.all('pagos');
      const cicFiltro = params.cic || '';
      const estadoFiltro = params.estado || '';
      const busqueda = (params.q || '').toLowerCase();

      const pensionesCalculadas = pensiones.map(p => {
        const inf = finance.info(p, pagos);
        const est = db.find('estudiantes', p.estudianteId);
        const cic = db.find('ciclos', p.cicloId);
        return { ...inf, est, cic };
      });

      const filtradas = pensionesCalculadas.filter(p => {
        if (cicFiltro && p.cicloId !== cicFiltro) return false;
        if (estadoFiltro && p.estado !== estadoFiltro) return false;
        if (busqueda) {
          const t = `${p.concepto} ${p.est?.nombres} ${p.est?.apellidos} ${p.est?.dni}`.toLowerCase();
          if (!t.includes(busqueda)) return false;
        }
        return true;
      });

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Cronograma de Pensiones</h3>
              <p class="page-desc">Obligaciones activas: ${pensiones.length} | Vencidas: ${filtradas.filter(p => p.estado === 'Vencida').length}</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" id="btn-nueva-obligacion">
                <i class="fa-solid fa-plus"></i> Nueva Cuota Individual
              </button>
            </div>
          </div>

          <!-- Filtros -->
          <div class="filters" style="--fcols:2">
            <div class="input-icon">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" id="filtro-pen-q" class="input" placeholder="Buscar por alumno, DNI o concepto..." value="${fmt.esc(params.q || '')}">
            </div>
            <select id="filtro-pen-cic" class="select">
              <option value="">Todos los ciclos</option>
              ${ciclos.map(c => { const pr = db.find('programas', c.programaId); return `<option value="${c.id}" ${cicFiltro === c.id ? 'selected' : ''}>${fmt.esc((pr ? (pr.siglas || pr.nombre) + ' · ' : '') + c.nombre)}</option>`; }).join('')}
            </select>
            <select id="filtro-pen-est" class="select">
              <option value="">Todos los estados</option>
              <option value="Pendiente" ${estadoFiltro === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="Parcial" ${estadoFiltro === 'Parcial' ? 'selected' : ''}>Parcial</option>
              <option value="Pagada" ${estadoFiltro === 'Pagada' ? 'selected' : ''}>Pagada</option>
              <option value="Vencida" ${estadoFiltro === 'Vencida' ? 'selected' : ''}>Vencida</option>
            </select>
          </div>

          <!-- Tabla -->
          ${filtradas.length === 0 ? UI.empty('No hay pensiones que coincidan con la búsqueda.') : UI.table({
            cols: [
              { label: 'Estudiante' },
              { label: 'Ciclo' },
              { label: 'Concepto' },
              { label: 'Vencimiento' },
              { label: 'Importe', cls: 'num' },
              { label: 'Abonado', cls: 'num' },
              { label: 'Saldo', cls: 'num' },
              { label: 'Estado' },
              { label: 'Acciones', cls: 'nowrap text-right' }
            ],
            rows: filtradas.map(p => [
              `<div>
                <a href="#estudiantes?id=${p.estudianteId}" class="font-bold text-slate-800 hover:text-brand">${fmt.esc(p.est ? `${p.est.nombres} ${p.est.apellidos}` : '—')}</a>
                <p class="text-xs text-slate-400">DNI ${p.est?.dni || '—'}</p>
              </div>`,
              `<span class="text-xs font-semibold">${fmt.esc(p.cic?.nombre || '—')}</span>`,
              `<span class="font-semibold text-slate-800">${fmt.esc(p.concepto)}</span>`,
              `<div>
                <span class="text-xs font-semibold ${p.estado === 'Vencida' ? 'text-red-600 font-bold' : 'text-slate-600'}">${fmt.date(p.fechaVencimiento)}</span>
                ${p.diasAtraso > 0 ? `<p class="text-[10px] text-red-500 font-bold">${p.diasAtraso} días atraso</p>` : ''}
              </div>`,
              fmt.money(p.importe),
              `<span class="font-bold text-emerald-700">${fmt.money(p.abonado)}</span>`,
              UI.saldoMora(p),
              UI.badge(p.estado),
              `<div class="actions">
                <button class="btn btn-secondary btn-sm" data-pen-ajuste="${p.id}" title="Ajustar fecha o importe"><i class="fa-solid fa-calendar-pen"></i></button>
              </div>`
            ])
          })}
        </div>
      `;
    },
    mount(params, root) {
      const applyFilters = () => {
        Shell.go('pensiones', {
          q: document.getElementById('filtro-pen-q').value.trim(),
          cic: document.getElementById('filtro-pen-cic').value,
          estado: document.getElementById('filtro-pen-est').value
        });
      };

      document.getElementById('filtro-pen-q').addEventListener('input', fmt.debounce(applyFilters, 300));
      document.getElementById('filtro-pen-cic').addEventListener('change', applyFilters);
      document.getElementById('filtro-pen-est').addEventListener('change', applyFilters);

      document.getElementById('btn-nueva-obligacion')?.addEventListener('click', () => PensionesView.modalNuevaObligacion());

      root.addEventListener('click', async e => {
        const btnA = e.target.closest('[data-pen-ajuste]');
        if (btnA) {
          PensionesView.modalAjuste(btnA.dataset.penAjuste);
        }
      });
    },

    modalNuevaObligacion() {
      const html = `
        <form id="form-nueva-obl" class="space-y-4">
          <div class="field">
            <label class="label">Estudiante <span class="text-red-500">*</span></label>
            ${Buscador.html({  })}
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Ciclo Asociado <span class="text-red-500">*</span></label>
              ${Buscador.html({ tipo: 'ciclo', name: 'cicloId' })}
            </div>
            <div class="field">
              <label class="label">Tipo de Obligación</label>
              <select name="tipo" class="select">
                <option value="Materiales">Materiales / Separatas</option>
                <option value="Simulacro Especial">Simulacro Especial</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label class="label">Concepto Descriptivo <span class="text-red-500">*</span></label>
            <input type="text" name="concepto" data-v="texto" minlength="3" maxlength="80" class="input" placeholder="Ej: Separata de Álgebra / Simulacro especial de Ciencias" required>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Importe Exigible (S/) <span class="text-red-500">*</span></label>
              <input type="number" step="0.01" min="1" max="200" name="importe" class="input" placeholder="0.00" required>
            </div>
            <div class="field">
              <label class="label">Fecha de Vencimiento <span class="text-red-500">*</span></label>
              <input type="date" name="fechaVencimiento" class="input" value="${fmt.addDays(fmt.today(), 15)}" min="${fmt.today()}" max="${fmt.addDays(fmt.today(), 730)}" required>
            </div>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Crear Obligación</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: 'Crear Cuota u Obligación Individual',
        subtitle: 'Generación puntual de conceptos de pago',
        icon: 'fa-receipt',
        body: html,
        size: 'md'
      });
      UI.initSearchSelect();

      document.getElementById('form-nueva-obl').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const estId = fd.get('estudianteId');
        const cicloId = fd.get('cicloId');
        const est = db.find('estudiantes', estId);
        if (!est) return UI.toast('Seleccione un estudiante de la lista');
        if (!db.find('ciclos', cicloId)) return UI.toast('Seleccione un ciclo de la lista');

        const nueva = db.insert('pensiones', {
          matriculaId: null,
          estudianteId: estId,
          cicloId,
          tipo: fd.get('tipo'),
          concepto: fd.get('concepto').trim(),
          numeroCuota: 99,
          importe: parseFloat(fd.get('importe')) || 0,
          descuento: 0,
          motivoDescuento: '',
          fechaVencimiento: fd.get('fechaVencimiento'),
          fechaCreacion: fmt.nowISO(),
          anulada: false
        }, 'pen');

        audit(`Creó obligación individual "${nueva.concepto}" para DNI ${est?.dni}`, 'Gestión de Pensiones', `Monto: S/ ${nueva.importe}`);
        UI.closeModal();
        UI.toast('Obligación creada exitosamente');
        Shell.refresh();
      });
    },

    modalAjuste(penId) {
      const pen = db.find('pensiones', penId);
      if (!pen) return;

      const html = `
        <form id="form-ajuste" class="space-y-4">
          <div class="field">
            <label class="label">Concepto</label>
            <input type="text" name="concepto" data-v="texto" minlength="3" maxlength="80" class="input" value="${fmt.esc(pen.concepto)}" required>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Importe Base (S/)</label>
              <input type="number" step="0.01" min="1" max="${['Materiales', 'Simulacro Especial'].includes(pen.tipo) ? 200 : 500}" name="importe" class="input" value="${pen.importe}" required>
            </div>
            <div class="field">
              <label class="label">Fecha de Vencimiento</label>
              <input type="date" name="fechaVencimiento" class="input" value="${pen.fechaVencimiento}" min="${fmt.addDays(fmt.today(), -1095)}" max="${fmt.addDays(fmt.today(), 1095)}" required>
            </div>
          </div>
          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Guardar Ajuste</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: 'Ajuste de Obligación',
        icon: 'fa-calendar-pen',
        body: html,
        size: 'md'
      });

      document.getElementById('form-ajuste').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        db.update('pensiones', pen.id, {
          concepto: fd.get('concepto'),
          importe: parseFloat(fd.get('importe')) || pen.importe,
          fechaVencimiento: fd.get('fechaVencimiento')
        });
        audit(`Ajustó fecha/monto de pensión ${pen.id}`, 'Gestión de Pensiones');
        UI.closeModal();
        UI.toast('Obligación ajustada');
        Shell.refresh();
      });
    }
  };

  /* ------------------------------------------------------------------
     5. VERIFICACIÓN DE PAGOS (Módulo Crítico)
     ------------------------------------------------------------------ */
  const PagosView = {
    title: 'Verificación de Pagos',
    subtitle: 'Auditoría y conciliación de pagos reportados vía Yape, Plin y registro en efectivo',
    POR_PAGINA: 10,

    /* Estado de filtros → se guarda en la URL (#pagos?...) para sobrevivir a F5 y a refrescos tras aprobar/rechazar */
    leer(params) {
      return {
        tab: ['Pendiente', 'Aprobado', 'Rechazado', 'todos'].includes(params.tab) ? params.tab : 'Pendiente',
        q: params.q || '',
        metodo: params.metodo || '',
        desde: params.desde || '',
        hasta: params.hasta || '',
        page: Math.max(1, parseInt(params.page, 10) || 1)
      };
    },
    guardarUrl(st) {
      const q = new URLSearchParams();
      if (st.tab !== 'Pendiente') q.set('tab', st.tab);
      ['q', 'metodo', 'desde', 'hasta'].forEach(k => { if (st[k]) q.set(k, st[k]); });
      if (st.page > 1) q.set('page', st.page);
      const qs = q.toString();
      history.replaceState(null, '', '#pagos' + (qs ? '?' + qs : ''));
    },
    hayFiltros: st => !!(st.q || st.metodo || st.desde || st.hasta),

    fechaDe: p => p.fechaPago || String(p.fechaReporte || '').slice(0, 10),

    /* Pagos que cumplen búsqueda + método + fechas (sin mirar la pestaña de estado).
       Se devuelven en orden cronológico (el primero que se reportó, primero); luego cada pestaña
       los ordena como COLA (pendientes) o como PILA (historiales). */
    base(st) {
      const tokens = fmt.norm(st.q).split(/\s+/).filter(Boolean);
      return db.all('pagos').slice()
        .sort((x, y) => x.fechaReporte.localeCompare(y.fechaReporte))
        .filter(p => {
          if (st.metodo && p.metodo !== st.metodo) return false;
          const f = PagosView.fechaDe(p);
          if (st.desde && f < st.desde) return false;
          if (st.hasta && f > st.hasta) return false;
          if (tokens.length) {
            const est = db.find('estudiantes', p.estudianteId);
            const pen = db.find('pensiones', p.pensionId);
            const hay = fmt.norm(`${est?.nombres || ''} ${est?.apellidos || ''} ${est?.dni || ''} ${p.numeroOperacion || ''} ${pen?.concepto || ''} ${p.reciboNumero || ''} ${p.metodo || ''}`);
            if (!tokens.every(t => hay.includes(t))) return false;
          }
          return true;
        });
    },

    fila(p) {
      const est = db.find('estudiantes', p.estudianteId);
      const pen = db.find('pensiones', p.pensionId);
      const isPend = p.estado === 'Pendiente';
      return [
        `<div>
          <span class="text-xs font-bold text-slate-800">${fmt.date(p.fechaPago)}</span>
          <p class="text-[11px] text-slate-400">${fmt.timeAgo(p.fechaReporte)}</p>
        </div>`,
        `<div>
          <a href="#estudiantes?id=${p.estudianteId}" class="font-bold text-slate-800 hover:text-brand">${fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—')}</a>
          <p class="text-xs text-slate-400">DNI ${est?.dni || '—'}</p>
        </div>`,
        `<span class="font-semibold text-slate-700">${fmt.esc(pen?.concepto || 'Cuota')}</span>`,
        UI.method(p.metodo),
        `<div><code class="text-xs bg-slate-100 px-2 py-1 rounded font-bold">${fmt.esc(p.numeroOperacion)}</code>${moraChip(p) ? `<div>${moraChip(p)}</div>` : ''}</div>`,
        p.comprobante ? `
          <button class="flex items-center gap-2 text-xs font-semibold text-brand hover:underline" data-view-voucher="${p.id}">
            <img src="${p.comprobante}" class="w-8 h-8 rounded object-cover border" alt="Voucher">
            <span>Ver voucher</span>
          </button>
        ` : '<span class="text-xs text-slate-400">Sin voucher (Efectivo)</span>',
        `<span class="font-extrabold text-base ${p.estado === 'Aprobado' ? 'text-emerald-600' : 'text-slate-900'}">${fmt.money(p.monto)}</span>`,
        `<div>
          ${UI.badge(p.estado)}
          ${p.motivoRechazo ? `<p class="text-[11px] text-red-500 mt-1 max-w-[160px] truncate" title="${fmt.esc(p.motivoRechazo)}">${fmt.esc(p.motivoRechazo)}</p>` : ''}
        </div>`,
        `<div class="actions">
          ${isPend ? `
            <button class="btn btn-success btn-sm" data-approve="${p.id}">
              <i class="fa-solid fa-check"></i> Aprobar
            </button>
            <button class="btn btn-danger btn-sm" data-reject="${p.id}">
              <i class="fa-solid fa-xmark"></i> Rechazar
            </button>
          ` : ''}
          ${p.estado === 'Aprobado' ? `
            <button class="btn btn-secondary btn-sm" data-print-recibo="${p.id}">
              <i class="fa-solid fa-print"></i> Recibo ${p.reciboNumero || ''}
            </button>
          ` : ''}
        </div>`
      ];
    },

    /* Bloque que se repinta al filtrar: pestañas (con contadores), resumen, tabla y paginación */
    resultado(st) {
      const base = PagosView.base(st);
      const cuenta = e => base.filter(p => p.estado === e).length;
      const delEstado = st.tab === 'todos' ? base : base.filter(p => p.estado === st.tab);
      // Pendientes de verificación = COLA (FIFO: se atiende primero el más antiguo).
      // Aprobados / Rechazados / Todos = PILA (LIFO: lo más reciente se ve primero).
      const esCola = st.tab === 'Pendiente';
      const filtrados = (esCola ? Cola.desde(delEstado) : Pila.desde(delEstado)).toArray();

      const total = filtrados.length;
      const paginas = Math.max(1, Math.ceil(total / PagosView.POR_PAGINA));
      st.page = Math.min(st.page, paginas);
      const ini = (st.page - 1) * PagosView.POR_PAGINA;
      const visibles = filtrados.slice(ini, ini + PagosView.POR_PAGINA);

      const montoTotal = fmt.sum(filtrados, p => p.monto);
      const montoAprob = fmt.sum(filtrados.filter(p => p.estado === 'Aprobado'), p => p.monto);

      // números de página: 1 … actual-1 actual actual+1 … última
      const nums = [];
      for (let i = 1; i <= paginas; i++) {
        if (i === 1 || i === paginas || Math.abs(i - st.page) <= 1) nums.push(i);
        else if (nums[nums.length - 1] !== '…') nums.push('…');
      }
      const paginacion = paginas > 1 ? `
        <div class="flex items-center justify-between flex-wrap gap-3 pt-1">
          <p class="text-xs text-slate-500">Mostrando <b>${ini + 1}–${ini + visibles.length}</b> de <b>${total}</b> pagos</p>
          <div class="flex items-center gap-1 flex-wrap">
            <button class="btn btn-secondary btn-sm" data-page="${st.page - 1}" ${st.page === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> Anterior</button>
            ${nums.map(n => n === '…'
              ? '<span class="px-1 text-slate-400">…</span>'
              : `<button class="btn ${n === st.page ? 'btn-primary' : 'btn-secondary'} btn-sm" data-page="${n}">${n}</button>`).join('')}
            <button class="btn btn-secondary btn-sm" data-page="${st.page + 1}" ${st.page === paginas ? 'disabled' : ''}>Siguiente <i class="fa-solid fa-chevron-right"></i></button>
          </div>
        </div>` : '';

      return `
        <!-- Pestañas de Estado (los contadores respetan los filtros) -->
        <div class="tabs">
          <button class="tab ${st.tab === 'Pendiente' ? 'active' : ''}" data-tab="Pendiente">
            <i class="fa-solid fa-clock"></i> Pendientes de Revisión <span class="count">${cuenta('Pendiente')}</span>
          </button>
          <button class="tab ${st.tab === 'Aprobado' ? 'active' : ''}" data-tab="Aprobado">
            <i class="fa-solid fa-circle-check"></i> Aprobados <span class="count">${cuenta('Aprobado')}</span>
          </button>
          <button class="tab ${st.tab === 'Rechazado' ? 'active' : ''}" data-tab="Rechazado">
            <i class="fa-solid fa-circle-xmark"></i> Rechazados <span class="count">${cuenta('Rechazado')}</span>
          </button>
          <button class="tab ${st.tab === 'todos' ? 'active' : ''}" data-tab="todos">
            Todos los Pagos <span class="count">${base.length}</span>
          </button>
        </div>

        ${st.tab === 'Pendiente' && cuenta('Pendiente') > 0 ? `
          <div class="alert alert-info">
            <i class="fa-solid fa-circle-info ai"></i>
            <div>
              <b>Regla de Negocio:</b> Los pagos en estado <i>Pendiente</i> NO reducen la deuda del estudiante ni se computan como ingresos confirmados hasta que usted presione <b>Aprobar</b>.
              <br><span class="text-xs"><i class="fa-solid fa-people-line"></i> <b>Cola de verificación (FIFO):</b> se atiende primero el pago reportado hace más tiempo.</span>
            </div>
          </div>
        ` : ''}

        ${total > 0 ? `
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <p><b class="text-slate-800">${total}</b> ${total === 1 ? 'pago' : 'pagos'}${PagosView.hayFiltros(st) ? ' con los filtros aplicados' : ''}
              · Total <b class="text-slate-800">${fmt.money(montoTotal)}</b>
              ${st.tab === 'todos' ? `· Aprobado <b class="text-emerald-600">${fmt.money(montoAprob)}</b>` : ''}</p>
            <span class="chip ${esCola ? 'chip-info' : ''}" title="${esCola ? 'Cola (FIFO): el primero que reportó es el primero en atenderse' : 'Pila (LIFO): el último pago aparece primero'}">
              <i class="fa-solid ${esCola ? 'fa-people-line' : 'fa-layer-group'}"></i> ${esCola ? 'Cola · más antiguos primero' : 'Pila · más recientes primero'}
            </span>
          </div>` : ''}

        ${total === 0
          ? UI.empty(PagosView.hayFiltros(st) ? 'No se encontraron pagos con los filtros aplicados.' : 'No hay pagos en esta categoría.',
              PagosView.hayFiltros(st) ? 'fa-magnifying-glass' : 'fa-circle-check',
              PagosView.hayFiltros(st) ? '<button class="btn btn-secondary btn-sm" data-limpiar-pagos><i class="fa-solid fa-eraser"></i> Limpiar filtros</button>' : '')
          : UI.table({
              cls: 'no-auto-page',
              cols: [
                { label: 'Fecha Reporte' },
                { label: 'Estudiante' },
                { label: 'Concepto / Cuota' },
                { label: 'Método' },
                { label: 'N° Operación' },
                { label: 'Comprobante' },
                { label: 'Monto Abono', cls: 'num' },
                { label: 'Estado' },
                { label: 'Acciones de Verificación', cls: 'nowrap text-right' }
              ],
              rows: visibles.map(p => PagosView.fila(p))
            })}

        ${paginacion}
      `;
    },

    render(params) {
      const st = PagosView.leer(params);
      const metodos = ['Yape', 'Plin', 'Efectivo', 'Transferencia'];

      return `
        <div class="card space-y-5">
          <div class="page-head">
            <div>
              <h3 class="page-title">Módulo de Verificación de Pagos</h3>
              <p class="page-desc">Valide o rechace transferencias digitales reportadas antes de su impacto financiero.</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-success" id="btn-pago-efectivo">
                <i class="fa-solid fa-cash-register"></i> Registrar Pago en Efectivo (Caja)
              </button>
            </div>
          </div>

          <!-- Filtros -->
          <div class="space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <div class="input-icon">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="search" id="filtro-pag-q" class="input" autocomplete="off"
                       placeholder="Buscar por estudiante, DNI, N° operación, concepto o recibo..." value="${fmt.esc(st.q)}">
              </div>
              <select id="filtro-pag-met" class="select" aria-label="Método de pago">
                <option value="">Todos los métodos</option>
                ${metodos.map(m => `<option value="${m}" ${st.metodo === m ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
              <input type="date" id="filtro-pag-desde" class="input" title="Desde" aria-label="Fecha desde" value="${st.desde}">
              <input type="date" id="filtro-pag-hasta" class="input" title="Hasta" aria-label="Fecha hasta" value="${st.hasta}">
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="text-slate-500 font-semibold">Fecha:</span>
              <button type="button" class="btn btn-secondary btn-sm" data-rango="hoy">Hoy</button>
              <button type="button" class="btn btn-secondary btn-sm" data-rango="7d">Últimos 7 días</button>
              <button type="button" class="btn btn-secondary btn-sm" data-rango="mes">Este mes</button>
              <button type="button" class="btn btn-soft-danger btn-sm" id="btn-limpiar-pagos" data-limpiar-pagos ${PagosView.hayFiltros(st) ? '' : 'hidden'}>
                <i class="fa-solid fa-eraser"></i> Limpiar filtros
              </button>
            </div>
          </div>

          <div id="pagos-resultado" class="space-y-5">${PagosView.resultado(st)}</div>
        </div>
      `;
    },
    mount(params, root) {
      const st = PagosView.leer(params);
      const q = document.getElementById('filtro-pag-q');
      const met = document.getElementById('filtro-pag-met');
      const desde = document.getElementById('filtro-pag-desde');
      const hasta = document.getElementById('filtro-pag-hasta');
      const btnLimpiar = document.getElementById('btn-limpiar-pagos');

      // Repinta solo el bloque de resultados (el cuadro de búsqueda conserva el foco)
      const pintar = (irArriba = false) => {
        document.getElementById('pagos-resultado').innerHTML = PagosView.resultado(st);
        btnLimpiar.hidden = !PagosView.hayFiltros(st);
        PagosView.guardarUrl(st);
        if (irArriba) {
          const y = document.getElementById('pagos-resultado').getBoundingClientRect().top + window.scrollY - 90;
          window.scrollTo({ top: Math.max(0, y) });
        }
      };
      const leerControles = () => {
        st.q = q.value.trim();
        st.metodo = met.value;
        st.desde = desde.value;
        st.hasta = hasta.value;
        if (st.desde && st.hasta && st.desde > st.hasta) { [st.desde, st.hasta] = [st.hasta, st.desde]; desde.value = st.desde; hasta.value = st.hasta; }
        st.page = 1;
        pintar();
      };

      q.addEventListener('input', fmt.debounce(leerControles, 250));
      [met, desde, hasta].forEach(el => el.addEventListener('change', leerControles));

      root.addEventListener('click', e => {
        const tab = e.target.closest('[data-tab]');
        if (tab) { st.tab = tab.dataset.tab; st.page = 1; pintar(); return; }
        const pag = e.target.closest('[data-page]');
        if (pag && !pag.disabled) { st.page = parseInt(pag.dataset.page, 10) || 1; pintar(true); return; }
        const rango = e.target.closest('[data-rango]');
        if (rango) {
          const hoy = fmt.today();
          if (rango.dataset.rango === 'hoy') { desde.value = hoy; hasta.value = hoy; }
          else if (rango.dataset.rango === '7d') { desde.value = fmt.addDays(hoy, -6); hasta.value = hoy; }
          else { desde.value = hoy.slice(0, 8) + '01'; hasta.value = hoy; }
          leerControles();
          return;
        }
        if (e.target.closest('[data-limpiar-pagos]')) {
          q.value = ''; met.value = ''; desde.value = ''; hasta.value = '';
          leerControles();
        }
      });

      document.getElementById('btn-pago-efectivo')?.addEventListener('click', () => PagosView.modalPagoEfectivo());

      root.addEventListener('click', async e => {
        const btnV = e.target.closest('[data-view-voucher]');
        if (btnV) {
          const pg = db.find('pagos', btnV.dataset.viewVoucher);
          if (pg?.comprobante) UI.viewImage(pg.comprobante, `Voucher de Operación ${pg.numeroOperacion}`);
          return;
        }
        const btnA = e.target.closest('[data-approve]');
        if (btnA) {
          await Actions.aprobarPago(btnA.dataset.approve);
          Shell.refresh();
          return;
        }
        const btnR = e.target.closest('[data-reject]');
        if (btnR) {
          await Actions.rechazarPago(btnR.dataset.reject);
          Shell.refresh();
          return;
        }
        const btnP = e.target.closest('[data-print-recibo]');
        if (btnP) {
          docs.printRecibo(btnP.dataset.printRecibo);
        }
      });
    },

    modalPagoEfectivo() {
      const estudiantes = db.all('estudiantes').filter(e => e.activo);
      const pagosAll = db.all('pagos');

      const html = `
        <form id="form-pago-efectivo" class="space-y-4">
          <div class="field">
            <label class="label">Estudiante <span class="text-red-500">*</span></label>
            ${Buscador.html({ id: 'ef-estudiante' })}
          </div>

          <div class="field">
            <label class="label">Pensión u Obligación a Pagar <span class="text-red-500">*</span></label>
            <select name="pensionId" id="ef-pension" class="select" required>
              <option value="">Primero seleccione estudiante...</option>
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Monto a Cobrar en Efectivo (S/) <span class="text-red-500">*</span></label>
              <input type="number" step="0.01" min="0.01" name="monto" id="ef-monto" class="input font-bold bg-slate-50 cursor-not-allowed" placeholder="Elija la cuota" readonly required>
              <span class="hint" id="ef-monto-hint">Se cobra el total de la cuota; no se aceptan pagos parciales.</span>
            </div>
            <div class="field">
              <label class="label">Fecha de Cobro</label>
              <input type="date" name="fechaPago" class="input" value="${fmt.today()}" min="${fmt.addDays(fmt.today(), -RULES.diasPagoAtras)}" max="${fmt.today()}" required>
            </div>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-success"><i class="fa-solid fa-receipt"></i> Cobrar y Emitir Recibo</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: 'Cobro en Efectivo (Caja Academia)',
        subtitle: 'El pago se aprueba y contabiliza de inmediato emitiendo el recibo interno',
        icon: 'fa-cash-register',
        body: html,
        size: 'md'
      });
      UI.initSearchSelect();

      const selE = document.getElementById('ef-estudiante');
      const selP = document.getElementById('ef-pension');
      const inM = document.getElementById('ef-monto');

      selE.addEventListener('change', () => {
        const estId = selE.value;
        inM.value = ''; inM.removeAttribute('max');
        if (!estId) { selP.innerHTML = '<option value="">Primero seleccione estudiante...</option>'; return; }
        const pens = finance.pensionesDe(estId, pagosAll).filter(p => !p.anulada && p.saldo > 0);
        if (pens.length === 0) {
          selP.innerHTML = '<option value="">El estudiante no tiene saldos pendientes.</option>';
          return;
        }
        // Orden de pago: primero la matrícula y luego las pensiones, de la más antigua a la más reciente.
        // Las cuotas posteriores quedan con candado y se habilitan al cancelar la anterior.
        const hab = finance.habilitadas(estId, pagosAll);
        const opcion = p => {
          const enRevision = p.disponible <= 0;
          const bloqueada = !enRevision && !hab.ids.has(p.id);
          const total = `Total: S/ ${(p.saldo + p.mora).toFixed(2)}${p.mora > 0 ? ` (incl. mora S/ ${p.mora.toFixed(2)})` : ''}`;
          const marca = enRevision ? ' · pago en revisión' : bloqueada ? ' · pague primero la cuota anterior' : '';
          return `<option value="${p.id}" ${enRevision || bloqueada ? 'disabled' : ''}>${bloqueada ? '🔒 ' : ''}${fmt.esc(p.concepto)} - ${total}${marca}</option>`;
        };
        // Se agrupan por matrícula (cada una tiene su propio orden); la matrícula va primero dentro de su grupo.
        const grupos = new Map();
        pens.forEach(p => { const k = p.matriculaId || p.cicloId || 'individual'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p); });
        const etiqueta = (k, lista) => {
          const m = db.find('matriculas', k);
          const c = db.find('ciclos', m ? m.cicloId : lista[0].cicloId);
          const prg = c ? db.find('programas', c.programaId) : null;
          return `${prg ? (prg.siglas || prg.nombre) : ''}${c ? ' · ' + c.nombre : ''}${m ? '' : ' · Obligaciones individuales'}`.replace(/^ · /, '');
        };
        selP.innerHTML = '<option value="">Seleccione cuota...</option>' +
          [...grupos.entries()].map(([k, lista]) => {
            lista.sort((a, b) => (b.tipo === 'Matrícula') - (a.tipo === 'Matrícula'));   // estable: el resto conserva su orden por fecha
            return `<optgroup label="${fmt.esc(etiqueta(k, lista))}">${lista.map(opcion).join('')}</optgroup>`;
          }).join('');
      });

      // El cobro en caja es SIEMPRE por el total de la cuota (saldo + mora hasta la fecha del cobro): no hay pagos parciales.
      const fechaCobro = () => { const f = document.querySelector('#form-pago-efectivo [name=fechaPago]')?.value; return f && f <= fmt.today() ? f : fmt.today(); };
      const actualizarMax = (reiniciar) => {
        const pen = selP.value ? db.find('pensiones', selP.value) : null;
        const hint = document.getElementById('ef-monto-hint');
        if (!pen) { inM.value = ''; inM.removeAttribute('max'); hint.textContent = 'Se cobra el total de la cuota; no se aceptan pagos parciales.'; return; }
        const inf = finance.info(pen, db.all('pagos'));
        const f = fechaCobro();
        const mora = inf.moraFija ? inf.mora : finance.moraA(inf, f);
        const max = finance.disponibleA(inf, f);
        inM.value = max.toFixed(2);                              // monto bloqueado: el total de la cuota
        inM.max = max.toFixed(2);
        hint.innerHTML = `Se cobra el total de la cuota: S/ ${max.toFixed(2)} (saldo${mora > 0 ? ` + mora de S/ ${mora.toFixed(2)}` : ''}). No se aceptan pagos parciales.` +
          (mora > 0 ? ` <button type="button" class="mora-eye" data-mora="${inf.id}" data-mora-fecha="${f}" title="Ver detalle de la mora"><i class="fa-solid fa-eye"></i></button>` : '');
      };
      selP.addEventListener('change', () => actualizarMax(true));
      document.querySelector('#form-pago-efectivo [name=fechaPago]')?.addEventListener('change', () => actualizarMax(true));

      document.getElementById('form-pago-efectivo').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const estId = fd.get('estudianteId');
        const pensionId = fd.get('pensionId');
        const fechaPago = fd.get('fechaPago');

        const est = db.find('estudiantes', estId);
        const pen = db.find('pensiones', pensionId);
        if (!est) return UI.toast('Seleccione un estudiante de la lista');
        if (!pen) return UI.toast('Seleccione la pensión u obligación a pagar');
        const hab = finance.habilitadas(estId, db.all('pagos'));
        if (!hab.ids.has(pen.id)) return UI.toast('Esta cuota está bloqueada: primero debe cancelarse la cuota anterior (la matrícula va primero).', 'warning');
        // El monto SIEMPRE se calcula aquí (total de la cuota): no se toma del campo, así no se puede alterar.
        const monto = finance.disponibleA(finance.info(pen, db.all('pagos')), fechaPago);
        if (!(monto > 0)) return UI.toast('Esta cuota no tiene monto por cobrar (pago en revisión o ya cancelada).', 'warning');

        // Una sola llamada: el servidor registra el pago aprobado, emite recibo, notifica y audita.
        const saved = window.PT.revisionPagos.registrarCaja({
          estudianteId: estId,
          pensionId,
          monto,
          fechaPago
        });
        UI.closeModal();
        UI.toast(`Pago registrado con Recibo ${saved.reciboNumero}`);
        docs.printRecibo(saved.id);
        Shell.refresh();
      });
    }
  };

  /* ------------------------------------------------------------------
     6. REPORTES
     ------------------------------------------------------------------ */
  const ReportesView = {
    title: 'Reportes y Estadísticas',
    subtitle: 'Generación de reportes de ingresos, morosidad y padrón con exportación a Excel y PDF',
    render(params) {
      const tipo = params.tipo || 'ingresos';
      const pagos = db.all('pagos');
      const pensiones = db.all('pensiones').filter(p => !p.anulada);
      const matriculas = db.all('matriculas');

      const aniosSet = new Set();
      pagos.forEach(p => p.fechaPago && aniosSet.add(p.fechaPago.slice(0, 4)));
      pensiones.forEach(p => p.fechaVencimiento && aniosSet.add(p.fechaVencimiento.slice(0, 4)));
      matriculas.forEach(m => m.fecha && aniosSet.add(m.fecha.slice(0, 4)));
      const anioActual = String(new Date().getFullYear());
      aniosSet.add(anioActual);
      const anios = Array.from(aniosSet).sort().reverse();

      return `
        <div class="card space-y-5">
          <div class="page-head">
            <div>
              <h3 class="page-title">Centro de Reportes Financieros</h3>
              <p class="page-desc">Consulte métricas para auditoría contable y gestión de cobranzas</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-secondary" id="btn-export-excel" disabled>
                <i class="fa-solid fa-file-excel text-emerald-600"></i> Exportar a Excel (.xlsx)
              </button>
              <button class="btn btn-primary" id="btn-print-report" disabled>
                <i class="fa-solid fa-print"></i> Imprimir / Exportar a PDF
              </button>
            </div>
          </div>

          <div class="tabs">
            <button class="tab ${tipo === 'ingresos' ? 'active' : ''}" data-tipo="ingresos">
              <i class="fa-solid fa-hand-holding-dollar"></i> Recaudación e Ingresos
            </button>
            <button class="tab ${tipo === 'morosidad' ? 'active' : ''}" data-tipo="morosidad">
              <i class="fa-solid fa-triangle-exclamation"></i> Morosidad y Saldos Vencidos
            </button>
            <button class="tab ${tipo === 'matriculas' ? 'active' : ''}" data-tipo="matriculas">
              <i class="fa-solid fa-address-book"></i> Padrón de Matrículas
            </button>
          </div>

          <!-- Filtros de Periodo -->
          <div class="filters" style="--fcols:3">
            <select id="filtro-rep-mes" class="select">
              <option value="">Todos los meses</option>
              ${PT.MESES.map((m, idx) => `<option value="${fmt.pad(idx + 1, 2)}">${m}</option>`).join('')}
            </select>
            <select id="filtro-rep-anio" class="select">
              ${anios.map(a => `<option value="${a}" ${a === anioActual ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
            <button class="btn btn-primary" id="btn-generar-reporte">
              <i class="fa-solid fa-arrow-rotate-right"></i> Generar reporte
            </button>
          </div>

          <div id="report-printable-area">
            ${UI.empty('Seleccione el periodo y pulse Generar reporte', 'fa-calendar-days')}
          </div>
        </div>
      `;
    },
    mount(params, root) {
      const tipo = params.tipo || 'ingresos';
      const btnExcel = document.getElementById('btn-export-excel');
      const btnPrint = document.getElementById('btn-print-report');
      const btnGenerar = document.getElementById('btn-generar-reporte');
      const selMes = document.getElementById('filtro-rep-mes');
      const selAnio = document.getElementById('filtro-rep-anio');
      const area = document.getElementById('report-printable-area');

      let reporteGenerado = null;

      root.querySelectorAll('.tab').forEach(t => {
        t.addEventListener('click', () => {
          Shell.go('reportes', { tipo: t.dataset.tipo });
        });
      });

      const resetReporte = () => {
        if (btnExcel) btnExcel.disabled = true;
        if (btnPrint) btnPrint.disabled = true;
        reporteGenerado = null;
        if (area) area.innerHTML = UI.empty('Seleccione el periodo y pulse Generar reporte', 'fa-calendar-days');
      };

      selMes?.addEventListener('change', resetReporte);
      selAnio?.addEventListener('change', resetReporte);

      btnGenerar?.addEventListener('click', () => {
        const mes = selMes.value;
        const anio = selAnio.value;
        const prefix = mes ? `${anio}-${mes}` : `${anio}-`;
        const periodCode = mes ? `${anio}-${mes}` : anio;
        const periodLabel = mes ? `${PT.MESES[parseInt(mes, 10) - 1]} ${anio}` : `Año ${anio}`;

        const pagos = db.all('pagos');
        const pensiones = db.all('pensiones').filter(p => !p.anulada);
        const matriculas = db.all('matriculas');

        if (tipo === 'ingresos') {
          const pagosAprobados = pagos.filter(p => p.estado === 'Aprobado' && p.fechaPago && p.fechaPago.startsWith(prefix))
            .slice().sort((a, b) => b.fechaPago.localeCompare(a.fechaPago));

          if (pagosAprobados.length === 0) {
            area.innerHTML = UI.empty('No se encontraron registros para el periodo seleccionado.', 'fa-inbox');
            btnExcel.disabled = true;
            btnPrint.disabled = true;
            reporteGenerado = null;
            return;
          }

          const total = fmt.sum(pagosAprobados, p => p.monto);
          area.innerHTML = `
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-extrabold text-navy text-lg">Reporte de Recaudación e Ingresos Confirmados</h4>
                  <p class="text-xs text-slate-500">Periodo: <b>${periodLabel}</b> · Monto total verificado: <b>${fmt.money(total)}</b> (${pagosAprobados.length} pagos)</p>
                </div>
              </div>
              ${UI.table({
                cols: [
                  { label: 'Recibo N°' },
                  { label: 'Fecha' },
                  { label: 'Estudiante / DNI' },
                  { label: 'Concepto' },
                  { label: 'Método' },
                  { label: 'N° Operación' },
                  { label: 'Importe Cobrado', cls: 'num' }
                ],
                rows: pagosAprobados.map(p => {
                  const est = db.find('estudiantes', p.estudianteId);
                  const pen = db.find('pensiones', p.pensionId);
                  return [
                    `<b>${p.reciboNumero || '—'}</b>`,
                    fmt.date(p.fechaPago),
                    `${fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—')} (DNI ${est?.dni || ''})`,
                    fmt.esc(pen?.concepto || 'Cuota'),
                    p.metodo,
                    fmt.esc(p.numeroOperacion),
                    `<span class="font-bold text-emerald-700">${fmt.money(p.monto)}</span>`
                  ];
                }),
                foot: `<tfoot><tr><td colspan="6" class="text-right">TOTAL GENERAL COBRADO (${periodLabel}):</td><td class="num font-extrabold text-emerald-700">${fmt.money(total)}</td></tr></tfoot>`
              })}
            </div>
          `;
          btnExcel.disabled = false;
          btnPrint.disabled = false;
          reporteGenerado = { tipo, periodCode, periodLabel, items: pagosAprobados };

        } else if (tipo === 'morosidad') {
          const todasVencidas = pensiones.map(p => finance.info(p, pagos)).filter(p => p.estado === 'Vencida');
          const vencidas = todasVencidas.filter(p => p.fechaVencimiento && p.fechaVencimiento.startsWith(prefix));

          if (vencidas.length === 0) {
            area.innerHTML = UI.empty('No se encontraron registros para el periodo seleccionado.', 'fa-circle-check');
            btnExcel.disabled = true;
            btnPrint.disabled = true;
            reporteGenerado = null;
            return;
          }

          const deudaTotal = fmt.sum(vencidas, p => p.saldo + p.mora);
          const moraTotalRep = fmt.sum(vencidas, p => p.mora);
          area.innerHTML = `
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-extrabold text-red-600 text-lg">Reporte de Morosidad y Pensiones Vencidas</h4>
                  <p class="text-xs text-slate-500">Periodo: <b>${periodLabel}</b> · Deuda total vencida: <b>${fmt.money(deudaTotal)}</b> (incluye mora de <b>${fmt.money(moraTotalRep)}</b>) en ${vencidas.length} cuotas</p>
                </div>
              </div>
              ${UI.table({
                cols: [
                  { label: 'Estudiante' },
                  { label: 'DNI' },
                  { label: 'Apoderado / Teléfono' },
                  { label: 'Concepto' },
                  { label: 'Fecha Vence' },
                  { label: 'Días Atraso', cls: 'num' },
                  { label: 'Saldo', cls: 'num' },
                  { label: 'Mora', cls: 'num' },
                  { label: 'Total a Pagar', cls: 'num' }
                ],
                rows: vencidas.map(p => {
                  const est = db.find('estudiantes', p.estudianteId);
                  return [
                    `<b>${fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—')}</b>`,
                    est?.dni || '—',
                    `${fmt.esc(est?.apoderado?.nombre || '—')} (Tel: ${est?.apoderado?.telefono || '—'})`,
                    fmt.esc(p.concepto),
                    fmt.date(p.fechaVencimiento),
                    `<span class="font-bold text-red-600">${p.diasAtraso} días</span>`,
                    `<span class="font-bold text-slate-700">${fmt.money(p.saldo)}</span>`,
                    p.mora > 0 ? `<span class="font-bold text-amber-600">+ ${fmt.money(p.mora)}</span> <button type="button" class="mora-eye" data-mora="${p.id}" title="Ver cómo se calculó la mora"><i class="fa-solid fa-eye"></i></button>` : '—',
                    `<span class="font-extrabold text-red-600">${fmt.money(p.saldo + p.mora)}</span>`
                  ];
                }),
                foot: `<tfoot><tr><td colspan="6" class="text-right">TOTAL DEUDA VENCIDA (${periodLabel}):</td><td class="num font-bold">${fmt.money(fmt.sum(vencidas, p => p.saldo))}</td><td class="num font-bold text-amber-600">${fmt.money(moraTotalRep)}</td><td class="num font-extrabold text-red-600">${fmt.money(deudaTotal)}</td></tr></tfoot>`
              })}
            </div>
          `;
          btnExcel.disabled = false;
          btnPrint.disabled = false;
          reporteGenerado = { tipo, periodCode, periodLabel, items: vencidas };

        } else {
          const matriculasFiltradas = matriculas.filter(m => m.fecha && m.fecha.startsWith(prefix));

          if (matriculasFiltradas.length === 0) {
            area.innerHTML = UI.empty('No se encontraron registros para el periodo seleccionado.', 'fa-inbox');
            btnExcel.disabled = true;
            btnPrint.disabled = true;
            reporteGenerado = null;
            return;
          }

          area.innerHTML = `
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-extrabold text-navy text-lg">Reporte de Matrículas por Ciclo</h4>
                  <p class="text-xs text-slate-500">Periodo: <b>${periodLabel}</b> · Total matriculados: <b>${matriculasFiltradas.length}</b></p>
                </div>
              </div>
              ${UI.table({
                cols: [
                  { label: 'Código' },
                  { label: 'Estudiante' },
                  { label: 'DNI' },
                  { label: 'Programa' },
                  { label: 'Ciclo' },
                  { label: 'Fecha' },
                  { label: 'Estado' }
                ],
                rows: matriculasFiltradas.map(m => {
                  const est = db.find('estudiantes', m.estudianteId);
                  const prg = db.find('programas', m.programaId);
                  const cic = db.find('ciclos', m.cicloId);
                  return [
                    m.codigo,
                    fmt.esc(est ? `${est.nombres} ${est.apellidos}` : '—'),
                    est?.dni || '—',
                    fmt.esc(prg?.nombre || '—'),
                    fmt.esc(cic?.nombre || '—'),
                    fmt.date(m.fecha),
                    UI.badge(m.estado)
                  ];
                })
              })}
            </div>
          `;
          btnExcel.disabled = false;
          btnPrint.disabled = false;
          reporteGenerado = { tipo, periodCode, periodLabel, items: matriculasFiltradas };
        }
      });

      btnExcel?.addEventListener('click', async () => {
        if (!reporteGenerado) return;
        const xl = window.PT.excel;
        if (!xl.disponible()) {
          return UI.alert('Excel no disponible', 'No se pudo cargar el generador de Excel. Verifique su conexión a internet y recargue la página.', 'warning');
        }
        const { tipo: tp, periodCode, periodLabel, items } = reporteGenerado;
        const nombre = est => (est ? `${est.nombres} ${est.apellidos}` : '—');
        let cfg;

        if (tp === 'ingresos') {
          const total = fmt.sum(items, p => p.monto);
          const porMetodo = {};
          items.forEach(p => { const m = porMetodo[p.metodo] || (porMetodo[p.metodo] = { n: 0, t: 0 }); m.n++; m.t = fmt.round2(m.t + Number(p.monto)); });
          const filasRes = Object.entries(porMetodo).sort((a, b) => b[1].t - a[1].t).map(([m, v]) => [m, v.n, v.t]);
          filasRes.push(['TOTAL', items.length, total]);
          cfg = {
            hoja: 'Ingresos', archivo: 'Reporte_Ingresos', titulo: 'REPORTE DE RECAUDACIÓN E INGRESOS CONFIRMADOS',
            columnas: [
              { titulo: 'Recibo N°', ancho: 14, tipo: 'codigo' }, { titulo: 'Fecha', ancho: 13, tipo: 'fecha' },
              { titulo: 'Estudiante', ancho: 32, tipo: 'texto' }, { titulo: 'DNI', ancho: 12, tipo: 'codigo' },
              { titulo: 'Concepto', ancho: 30, tipo: 'texto' }, { titulo: 'Método', ancho: 14, tipo: 'texto' },
              { titulo: 'N° Operación', ancho: 15, tipo: 'codigo' }, { titulo: 'Importe Cobrado', ancho: 17, tipo: 'dinero' }
            ],
            filas: items.map(p => {
              const est = db.find('estudiantes', p.estudianteId), pen = db.find('pensiones', p.pensionId);
              return [p.reciboNumero || '—', xl.fecha(p.fechaPago), nombre(est), est?.dni || '', pen?.concepto || 'Cuota', p.metodo, String(p.numeroOperacion || ''), Number(p.monto)];
            }),
            totales: { etiqueta: `TOTAL GENERAL COBRADO (${periodLabel}):`, columnas: [{ idx: 8, tipo: 'suma', valor: total }] },
            resumen: { titulo: 'Resumen de ingresos por método de pago', encabezados: ['Método de pago', 'N° de pagos', 'Total cobrado'], tipos: ['texto', 'entero', 'dinero'], filas: filasRes, ultimaEsTotal: true }
          };
        } else if (tp === 'morosidad') {
          const total = fmt.sum(items, p => p.saldo + p.mora);
          const totalSaldo = fmt.sum(items, p => p.saldo);
          const totalMora = fmt.sum(items, p => p.mora);
          const tramos = [['De 1 a 30 días', 1, 30], ['De 31 a 60 días', 31, 60], ['De 61 a 90 días', 61, 90], ['Más de 90 días', 91, Infinity]];
          const filasRes = tramos.map(([l, a, b]) => {
            const g = items.filter(p => p.diasAtraso >= a && p.diasAtraso <= b);
            return [l, g.length, fmt.sum(g, p => p.saldo + p.mora)];
          });
          filasRes.push(['TOTAL', items.length, total]);
          cfg = {
            hoja: 'Morosidad', archivo: 'Reporte_Morosidad', titulo: 'REPORTE DE MOROSIDAD Y PENSIONES VENCIDAS',
            columnas: [
              { titulo: 'Estudiante', ancho: 32, tipo: 'texto' }, { titulo: 'DNI', ancho: 12, tipo: 'codigo' },
              { titulo: 'Apoderado', ancho: 28, tipo: 'texto' }, { titulo: 'Teléfono Apoderado', ancho: 17, tipo: 'codigo' },
              { titulo: 'Concepto', ancho: 28, tipo: 'texto' }, { titulo: 'Vencimiento', ancho: 14, tipo: 'fecha' },
              { titulo: 'Días de Atraso', ancho: 13, tipo: 'entero' }, { titulo: 'Saldo (sin mora)', ancho: 17, tipo: 'dinero' },
              { titulo: 'Mora', ancho: 14, tipo: 'dinero' }, { titulo: 'Total a Pagar', ancho: 17, tipo: 'dinero' }
            ],
            filas: items.map(p => {
              const est = db.find('estudiantes', p.estudianteId);
              return [nombre(est), est?.dni || '', est?.apoderado?.nombre || '—', est?.apoderado?.telefono || '—', p.concepto, xl.fecha(p.fechaVencimiento), Number(p.diasAtraso), Number(p.saldo), Number(p.mora), Number(fmt.round2(p.saldo + p.mora))];
            }),
            totales: { etiqueta: `TOTAL DEUDA VENCIDA (${periodLabel}):`, columnas: [{ idx: 8, tipo: 'suma', valor: totalSaldo }, { idx: 9, tipo: 'suma', valor: totalMora }, { idx: 10, tipo: 'suma', valor: total }] },
            resumen: { titulo: 'Antigüedad de la deuda vencida', encabezados: ['Antigüedad de la deuda', 'N° de cuotas', 'Deuda vencida (con mora)'], tipos: ['texto', 'entero', 'dinero'], filas: filasRes, ultimaEsTotal: true }
          };
        } else {
          const total = fmt.sum(items, m => m.montoMatricula);
          const porPrg = {};
          items.forEach(m => {
            const nom = db.find('programas', m.programaId)?.nombre || '—';
            const g = porPrg[nom] || (porPrg[nom] = { n: 0, a: 0, t: 0 });
            g.n++; if (m.estado === 'Activa') g.a++; g.t = fmt.round2(g.t + Number(m.montoMatricula || 0));
          });
          const filasRes = Object.entries(porPrg).sort((a, b) => b[1].n - a[1].n).map(([n, g]) => [n, g.n, g.a, g.t]);
          filasRes.push(['TOTAL', items.length, items.filter(m => m.estado === 'Activa').length, total]);
          cfg = {
            hoja: 'Matrículas', archivo: 'Reporte_Matriculas', titulo: 'REPORTE DE MATRÍCULAS POR CICLO',
            columnas: [
              { titulo: 'Código', ancho: 16, tipo: 'codigo' }, { titulo: 'Estudiante', ancho: 32, tipo: 'texto' },
              { titulo: 'DNI', ancho: 12, tipo: 'codigo' }, { titulo: 'Programa', ancho: 30, tipo: 'texto' },
              { titulo: 'Ciclo', ancho: 12, tipo: 'codigo' }, { titulo: 'Fecha', ancho: 13, tipo: 'fecha' },
              { titulo: 'Estado', ancho: 12, tipo: 'codigo' }, { titulo: 'Monto Matrícula', ancho: 17, tipo: 'dinero' }
            ],
            filas: items.map(m => {
              const est = db.find('estudiantes', m.estudianteId), prg = db.find('programas', m.programaId), cic = db.find('ciclos', m.cicloId);
              return [m.codigo, nombre(est), est?.dni || '', prg?.nombre || '—', cic?.nombre || '—', xl.fecha(m.fecha), m.estado, Number(m.montoMatricula || 0)];
            }),
            totales: { etiqueta: `TOTAL: ${items.length} MATRÍCULAS (${periodLabel}):`, columnas: [{ idx: 8, tipo: 'suma', valor: total }] },
            resumen: { titulo: 'Matrículas por programa académico', encabezados: ['Programa', 'Matrículas', 'Activas', 'Monto total'], tipos: ['texto', 'entero', 'entero', 'dinero'], filas: filasRes, ultimaEsTotal: true }
          };
        }

        btnExcel.disabled = true;
        try {
          const blob = await xl.generar({ ...cfg, periodo: periodLabel, usuario: admin.nombre });
          UI.download(`${cfg.archivo}_${periodCode}.xlsx`, blob, blob.type);
          UI.toast('Archivo Excel (.xlsx) descargado');
        } catch (err) {
          console.error(err);
          UI.alert('No se pudo generar el Excel', 'Ocurrió un problema al crear el archivo. Intente nuevamente.', 'error');
        } finally {
          btnExcel.disabled = false;
        }
      });

      btnPrint?.addEventListener('click', () => {
        if (!reporteGenerado) return;
        const contenidoArea = window.PT.Pager.sinPaginar(area);   // imprime TODAS las filas, sin barras de página
        const titulos = { ingresos: 'Recaudación e Ingresos', morosidad: 'Morosidad y Saldos Vencidos', matriculas: 'Padrón de Matrículas' };
        const nomReporte = titulos[reporteGenerado.tipo] || 'Reporte Financiero';
        const html = `
          <div class="report-head">
            <div>
              <h2 class="text-2xl font-extrabold text-navy">PLUSTWENTY ACADEMIA PREUNIVERSITARIA</h2>
              <p class="text-xs text-slate-500">RUC ${PT.ACADEMIA.ruc} · ${PT.ACADEMIA.direccion}</p>
              <p class="text-sm font-bold text-slate-700 mt-1">Periodo: ${reporteGenerado.periodLabel}</p>
            </div>
            <div class="text-right">
              <p class="text-xs font-bold text-slate-600">Fecha de emisión: ${fmt.today()}</p>
              <p class="text-xs text-slate-400">Generado por: ${admin.nombre}</p>
            </div>
          </div>
          ${contenidoArea}
        `;
        UI.printHTML(`Reporte de ${nomReporte} (${reporteGenerado.periodLabel}) · PLUSTWENTY`, html);
      });
    }
  };

  /* ------------------------------------------------------------------
     7. GESTIÓN DE USUARIOS Y ROLES
     ------------------------------------------------------------------ */
  const UsuariosView = {
    title: 'Gestión de Usuarios y Roles',
    subtitle: 'Administración de accesos, roles de sistema y reseteo de claves',
    render(params = {}) {
      const users = db.all('users');
      const busqueda = (params.q || '').toLowerCase();
      const rolFiltro = params.rol || '';

      const filtrados = users.filter(u => {
        if (rolFiltro && u.rol !== rolFiltro) return false;
        if (busqueda) {
          const t = `${u.username || ''} ${u.nombre || ''} ${u.email || ''}`.toLowerCase();
          if (!t.includes(busqueda)) return false;
        }
        return true;
      });

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Cuentas de Acceso al Sistema</h3>
              <p class="page-desc">Total cuentas: ${users.length} | Administradores: ${users.filter(u => u.rol === 'admin').length} | Estudiantes/Apoderados: ${users.filter(u => u.rol === 'user').length}</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" id="btn-nuevo-usuario">
                <i class="fa-solid fa-user-plus"></i> Nueva Cuenta de Usuario
              </button>
            </div>
          </div>

          <!-- Filtros -->
          <div class="filters" style="--fcols:2">
            <div class="input-icon">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" id="filtro-usr-q" class="input" placeholder="Buscar por usuario, nombre o correo..." value="${fmt.esc(params.q || '')}">
            </div>
            <select id="filtro-usr-rol" class="select">
              <option value="">Todos los roles</option>
              <option value="admin" ${rolFiltro === 'admin' ? 'selected' : ''}>Administradores</option>
              <option value="user" ${rolFiltro === 'user' ? 'selected' : ''}>Estudiantes / Apoderados</option>
            </select>
          </div>

          ${filtrados.length === 0 ? UI.empty('No se encontraron cuentas con los filtros aplicados.') : UI.table({
            cols: [
              { label: 'Usuario / Login' },
              { label: 'Nombre Completo' },
              { label: 'Correo' },
              { label: 'Rol' },
              { label: 'Vinculación' },
              { label: 'Estado' },
              { label: 'Acciones', cls: 'nowrap text-right' }
            ],
            rows: filtrados.map(u => {
              const est = u.estudianteId ? db.find('estudiantes', u.estudianteId) : null;
              const isMe = u.id === admin.id;

              return [
                `<code class="font-bold text-navy bg-blue-50 px-2 py-1 rounded">${fmt.esc(u.username)}</code>`,
                `<b>${fmt.esc(u.nombre)}</b>`,
                `<span class="text-xs text-slate-500">${fmt.esc(u.email || '—')}</span>`,
                UI.badge(u.rol === 'admin' ? 'Administrador' : (u.tipo || 'Estudiante')),
                est ? `<a href="#estudiantes?id=${est.id}" class="text-xs text-brand hover:underline font-semibold">DNI ${est.dni} (${est.nombres.split(' ')[0]})</a>` : '<span class="text-xs text-slate-400">Cuenta Admin</span>',
                UI.badge(u.activo ? 'Activo' : 'Inactivo'),
                `<div class="actions">
                  <button class="btn btn-secondary btn-sm" data-reset-pass="${u.id}" title="Resetear contraseña"><i class="fa-solid fa-key"></i></button>
                  ${!isMe ? `
                    <button class="btn ${u.activo ? 'btn-soft-danger' : 'btn-soft-success'} btn-sm" data-toggle-user="${u.id}" title="${u.activo ? 'Desactivar acceso' : 'Activar acceso'}">
                      <i class="fa-solid ${u.activo ? 'fa-ban' : 'fa-check'}"></i>
                    </button>
                  ` : ''}
                </div>`
              ];
            })
          })}
        </div>
      `;
    },
    mount(params, root) {
      const applyFilters = () => {
        Shell.go('usuarios', {
          q: document.getElementById('filtro-usr-q').value.trim(),
          rol: document.getElementById('filtro-usr-rol').value
        });
      };
      document.getElementById('filtro-usr-q')?.addEventListener('input', fmt.debounce(applyFilters, 300));
      document.getElementById('filtro-usr-rol')?.addEventListener('change', applyFilters);

      document.getElementById('btn-nuevo-usuario')?.addEventListener('click', () => UsuariosView.modalCrear());

      root.addEventListener('click', async e => {
        const btnR = e.target.closest('[data-reset-pass]');
        if (btnR) {
          UsuariosView.modalReset(btnR.dataset.resetPass);
          return;
        }
        const btnT = e.target.closest('[data-toggle-user]');
        if (btnT) {
          const u = db.find('users', btnT.dataset.toggleUser);
          if (!u) return;
          const nuevo = !u.activo;
          window.PT.Cargando.ejecutar(() => {
            db.update('users', u.id, { activo: nuevo });
            audit(`Cambió estado de usuario "${u.username}" a ${nuevo ? 'Activo' : 'Inactivo'}`, 'Gestión de Usuarios y Roles');
            UI.toast(`Usuario ${nuevo ? 'activado' : 'desactivado'}`);
            Shell.refresh();
          }, 'Actualizando usuario…');
        }
      });
    },

    modalCrear() {
      const estudiantes = db.all('estudiantes');

      const html = `
        <form id="form-nuevo-user" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Rol de Acceso <span class="text-red-500">*</span></label>
              <select name="rol" id="u-rol" class="select" required>
                <option value="admin">Administrador / Personal de Caja</option>
                <option value="user" selected>Estudiante / Apoderado</option>
              </select>
            </div>
            <div class="field" id="wrap-estudiante">
              <label class="label">Vincular a Estudiante</label>
              ${Buscador.html({ requerido: false })}
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Nombre Completo <span class="text-red-500">*</span></label>
              <input type="text" name="nombre" data-v="persona" class="input" required placeholder="Ej: Mario Vargas Llosa">
            </div>
            <div class="field">
              <label class="label">Correo Electrónico <span class="text-red-500">*</span></label>
              <input type="email" name="email" class="input" required placeholder="correo@academia.com">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Nombre de Usuario (Login) <span class="text-red-500">*</span></label>
              <input type="text" name="username" class="input" required placeholder="usuario.login">
            </div>
            <div class="field">
              <label class="label">Contraseña Inicial <span class="text-red-500">*</span></label>
              <input type="password" name="password" data-v="password" minlength="6" class="input" required value="123456">
            </div>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Crear Cuenta</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: 'Crear Nueva Cuenta de Usuario',
        icon: 'fa-user-gear',
        body: html,
        size: 'md'
      });
      UI.initSearchSelect();

      document.getElementById('form-nuevo-user').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const username = fd.get('username').trim().toLowerCase();
        const rol = fd.get('rol');

        const existe = db.all('users').some(x => x.username.toLowerCase() === username);
        if (existe) return UI.alert('Usuario ya existe', 'El nombre de usuario ya está en uso. Elija otro.', 'error');

        db.insert('users', {
          username,
          password: fd.get('password'),
          rol,
          tipo: rol === 'admin' ? 'Administrador' : 'Estudiante',
          nombre: fd.get('nombre').trim(),
          email: fd.get('email').trim(),
          estudianteId: rol === 'admin' ? null : (fd.get('estudianteId') || null),
          activo: true,
          fechaCreacion: fmt.nowISO()
        }, 'usr');

        audit(`Creó cuenta de usuario "${username}" con rol ${rol}`, 'Gestión de Usuarios y Roles');
        UI.closeModal();
        UI.toast('Usuario creado exitosamente');
        Shell.refresh();
      });
    },

    async modalReset(userId) {
      const u = db.find('users', userId);
      if (!u) return;
      const passSugerida = fmt.randomPassword(8);

      const r = await UI.reason({
        title: `Resetear Contraseña de ${u.nombre}`,
        text: `Ingrese la nueva contraseña para el usuario <b>${u.username}</b> (Sugerencia generada: <code>${passSugerida}</code>):`,
        placeholder: passSugerida,
        confirmText: 'Actualizar Contraseña'
      });
      if (!r || !r.motivo) return;

      if (r.motivo.length < 6 || /\s/.test(r.motivo)) {
        return UI.alert('Contraseña no válida', 'La contraseña debe tener al menos 6 caracteres y no puede contener espacios.', 'warning');
      }
      await window.PT.Cargando.ejecutar(() => {
        db.update('users', u.id, { password: r.motivo });
        audit(`Reseteó contraseña del usuario "${u.username}"`, 'Gestión de Usuarios y Roles');
      }, 'Actualizando contraseña…');
      UI.alert('Contraseña Actualizada', '', 'success',
        `<p>La nueva contraseña para <b>${fmt.esc(u.username)}</b> es:</p><p style="margin-top:.8rem"><span class="text-xl font-mono font-extrabold text-navy">${fmt.esc(r.motivo)}</span></p>`);
    }
  };

  /* ------------------------------------------------------------------
     8. CONFIGURACIÓN ACADÉMICA (Programas y Ciclos)
     ------------------------------------------------------------------ */
  const ConfiguracionView = {
    title: 'Configuración Académica',
    subtitle: 'Administración de la oferta formativa, programas preuniversitarios, ciclos y tarifas',
    render() {
      const programas = db.all('programas');
      const ciclos = db.all('ciclos');

      return `
        <div class="space-y-6">
          <!-- Programas -->
          <div class="card space-y-4">
            <div class="card-head">
              <div>
                <h3 class="card-title"><i class="fa-solid fa-graduation-cap"></i> Programas Académicos</h3>
                <p class="card-sub">Universidades de destino y áreas de preparación</p>
              </div>
              <button class="btn btn-primary btn-sm" id="btn-nuevo-prg">
                <i class="fa-solid fa-plus"></i> Nuevo Programa
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              ${programas.map(p => `
                <div class="prog-card" style="--pc:${p.color || '#1E3A8A'}">
                  <div class="flex items-center justify-between mb-2">
                    <span class="font-extrabold text-base text-slate-800">${fmt.esc(p.nombre)}</span>
                    <span class="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">${fmt.esc(p.siglas)}</span>
                  </div>
                  <p class="text-xs text-slate-500 line-clamp-2 mb-3">${fmt.esc(p.descripcion || '')}</p>
                  <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    ${UI.badge(p.activo ? 'Activo' : 'Inactivo')}
                    <button class="btn btn-secondary btn-sm" data-edit-prg="${p.id}"><i class="fa-solid fa-pen"></i></button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Ciclos -->
          <div class="card space-y-4">
            <div class="card-head">
              <div>
                <h3 class="card-title"><i class="fa-solid fa-calendar-week"></i> Ciclos y Tarifas</h3>
                <p class="card-sub">Costos de matrícula, cuotas de pensión y fechas de inicio/fin</p>
              </div>
              <button class="btn btn-primary btn-sm" id="btn-nuevo-cic">
                <i class="fa-solid fa-plus"></i> Nuevo Ciclo
              </button>
            </div>

            ${UI.table({
              cols: [
                { label: 'Programa' },
                { label: 'Ciclo' },
                { label: 'Modalidad' },
                { label: 'Duración' },
                { label: 'Tarifa Matrícula', cls: 'num' },
                { label: 'Pensión Mensual', cls: 'num' },
                { label: 'Cuotas', cls: 'num' },
                { label: 'Acciones', cls: 'nowrap text-right' }
              ],
              rows: ciclos.map(c => {
                const prg = db.find('programas', c.programaId);
                return [
                  `<b>${fmt.esc(prg?.nombre || '—')}</b>`,
                  `<span class="font-bold text-navy">${fmt.esc(c.nombre)}</span>`,
                  `<span class="badge badge-info">${fmt.esc(c.modalidad)}</span>`,
                  `<span class="text-xs">${fmt.date(c.fechaInicio)} al ${fmt.date(c.fechaFin)}</span>`,
                  `<span class="font-semibold">${fmt.money(c.matricula)}</span>`,
                  `<span class="font-bold text-emerald-700">${fmt.money(c.pension)}</span>`,
                  `<b>${c.cuotas} cuotas</b>`,
                  `<div class="actions">
                    <button class="btn btn-secondary btn-sm" data-edit-cic="${c.id}"><i class="fa-solid fa-pen"></i></button>
                  </div>`
                ];
              })
            })}
          </div>
        </div>
      `;
    },
    mount(params, root) {
      document.getElementById('btn-nuevo-prg')?.addEventListener('click', () => ConfiguracionView.modalPrograma());
      document.getElementById('btn-nuevo-cic')?.addEventListener('click', () => ConfiguracionView.modalCiclo());

      root.addEventListener('click', e => {
        const btnP = e.target.closest('[data-edit-prg]');
        if (btnP) ConfiguracionView.modalPrograma(btnP.dataset.editPrg);
        const btnC = e.target.closest('[data-edit-cic]');
        if (btnC) ConfiguracionView.modalCiclo(btnC.dataset.editCic);
      });
    },

    modalPrograma(prgId = null) {
      const p = prgId ? db.find('programas', prgId) : null;

      const html = `
        <form id="form-prg" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Nombre del Programa <span class="text-red-500">*</span></label>
              <input type="text" name="nombre" data-v="titulo" class="input" value="${fmt.esc(p?.nombre || '')}" required placeholder="Ej: Universidad Nacional de Trujillo">
            </div>
            <div class="field">
              <label class="label">Siglas / Código <span class="text-red-500">*</span></label>
              <input type="text" name="siglas" data-v="siglas" class="input uppercase" value="${fmt.esc(p?.siglas || '')}" required placeholder="UNT">
            </div>
          </div>
          <div class="field">
            <label class="label">Descripción</label>
            <textarea name="descripcion" data-v="texto" maxlength="200" class="textarea" rows="2">${fmt.esc(p?.descripcion || '')}</textarea>
          </div>
          <div class="field">
            <label class="label">Color Distintivo</label>
            <input type="color" name="color" class="h-10 w-20 rounded cursor-pointer" value="${p?.color || '#1E3A8A'}">
          </div>
          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Guardar</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: p ? `Editar Programa ${p.nombre}` : 'Nuevo Programa Académico',
        icon: 'fa-graduation-cap',
        body: html,
        size: 'md'
      });

      document.getElementById('form-prg').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
          nombre: fd.get('nombre').trim(),
          siglas: fd.get('siglas').trim().toUpperCase(),
          descripcion: fd.get('descripcion').trim(),
          color: fd.get('color'),
          activo: true
        };
        if (p) {
          db.update('programas', p.id, data);
          audit(`Actualizó programa académico ${data.nombre}`, 'Configuración Académica');
        } else {
          db.insert('programas', data, 'prg');
          audit(`Creó nuevo programa académico ${data.nombre}`, 'Configuración Académica');
        }
        UI.closeModal();
        UI.toast('Programa guardado');
        Shell.refresh();
      });
    },

    modalCiclo(cicId = null) {
      const c = cicId ? db.find('ciclos', cicId) : null;
      const programas = db.all('programas');

      // ---- Fechas coherentes con una academia: el ciclo se crea antes de empezar ----
      const RC = RULES.ciclo;
      const hoy = fmt.today();
      const mesSiguiente = n => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + n, 1); };
      const iniDefecto = fmt.toISO(mesSiguiente(1));                                   // 1.º del próximo mes
      const finDefecto = fmt.toISO(new Date(mesSiguiente(1).getFullYear(), mesSiguiente(1).getMonth() + 4, 15));
      const nombreDefecto = `${iniDefecto.slice(0, 4)}-${Number(iniDefecto.slice(5, 7)) <= 6 ? 'I' : 'II'}`;
      // Nuevo: no puede empezar en el pasado. Edición: no se puede adelantar el inicio más allá de lo ya registrado.
      const minInicio = c ? (c.fechaInicio < hoy ? c.fechaInicio : hoy) : hoy;
      const minFin = c ? (c.fechaFin < hoy ? c.fechaFin : hoy) : hoy;
      const maxInicio = fmt.addDays(hoy, Math.round(RC.mesesAnticipacionMax * 30.4));
      const maxFin = fmt.addDays(maxInicio, RC.duracionMaxDias);
      const orig = c ? { programaId: c.programaId, nombre: c.nombre, fechaInicio: c.fechaInicio, fechaFin: c.fechaFin, cuotas: String(c.cuotas) } : null;
      // En una edición, un campo no se re-valida si no cambió (los ciclos antiguos siguen siendo editables).
      const sinCambios = (form, campos) => !!orig && campos.every(k => String(form.elements[k].value) === String(orig[k]));

      const V = window.PT.Forms.validadores;
      V['ciclo-nombre'] = (el, form) => {
        if (sinCambios(form, ['programaId', 'nombre', 'fechaInicio'])) return '';
        const anio = (/^(\d{4})/.exec(el.value) || [])[1];
        const inicio = form.elements.fechaInicio.value;
        if (anio && inicio && anio !== inicio.slice(0, 4)) return `El nombre indica el año ${anio}, pero el ciclo inicia en ${inicio.slice(0, 4)}.`;
        const repetido = db.all('ciclos').some(x => x.id !== cicId && x.programaId === form.elements.programaId.value && String(x.nombre).toUpperCase() === el.value.toUpperCase());
        return repetido ? `Ya existe un ciclo "${el.value.toUpperCase()}" para este programa.` : '';
      };
      V['ciclo-fin'] = (el, form) => {
        if (sinCambios(form, ['fechaInicio', 'fechaFin', 'cuotas'])) return '';
        const inicio = form.elements.fechaInicio.value;
        if (!inicio) return '';
        const dias = fmt.daysBetween(inicio, el.value);
        if (dias < RC.duracionMinDias) return `Un ciclo debe durar al menos ${RC.duracionMinDias} días.`;
        if (dias > RC.duracionMaxDias) return 'Un ciclo no puede durar más de 12 meses. Revise la fecha de fin.';
        const n = parseInt(form.elements.cuotas.value, 10) || 0;
        if (n >= 1) {
          const di = fmt.parseDate(inicio);
          const ultima = fmt.toISO(new Date(di.getFullYear(), di.getMonth() + n - 1, 15));   // las pensiones vencen el día 15
          if (el.value < ultima) return `Con ${n} ${n === 1 ? 'pensión' : 'pensiones'}, la última vence el ${window.PT.Forms.esFecha(ultima)}: el ciclo no puede terminar antes. Amplíe la fecha de fin o reduzca las pensiones.`;
        }
        return '';
      };

      const html = `
        <form id="form-cic" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="field">
              <label class="label">Programa Académico <span class="text-red-500">*</span></label>
              <select name="programaId" class="select" required>
                ${programas.map(p => `<option value="${p.id}" ${c?.programaId === p.id ? 'selected' : ''}>${fmt.esc(p.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="label">Nombre del Ciclo <span class="text-red-500">*</span></label>
              <input type="text" name="nombre" data-v="ciclo" data-validar="ciclo-nombre" class="input uppercase" value="${fmt.esc(c?.nombre || nombreDefecto)}" required placeholder="${nombreDefecto}">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="field">
              <label class="label">Modalidad</label>
              <select name="modalidad" class="select">
                <option value="Regular" ${c?.modalidad === 'Regular' ? 'selected' : ''}>Regular</option>
                <option value="Intensivo" ${c?.modalidad === 'Intensivo' ? 'selected' : ''}>Intensivo</option>
                <option value="Repaso" ${c?.modalidad === 'Repaso' ? 'selected' : ''}>Repaso</option>
                <option value="Verano" ${c?.modalidad === 'Verano' ? 'selected' : ''}>Verano</option>
              </select>
            </div>
            <div class="field">
              <label class="label">Fecha Inicio</label>
              <input type="date" name="fechaInicio" class="input" value="${c?.fechaInicio || iniDefecto}" min="${minInicio}" max="${maxInicio}"
                data-min-msg="${c ? 'No se puede adelantar el inicio a una fecha anterior a la ya registrada.' : 'No se puede crear un ciclo que ya empezó: el inicio debe ser hoy o una fecha futura.'}"
                data-max-msg="Un ciclo no puede crearse con más de ${RC.mesesAnticipacionMax} meses de anticipación." required>
            </div>
            <div class="field">
              <label class="label">Fecha Fin</label>
              <input type="date" name="fechaFin" data-after="fechaInicio" data-after-msg="La fecha de fin debe ser posterior a la fecha de inicio." data-validar="ciclo-fin" class="input" value="${c?.fechaFin || finDefecto}" min="${minFin}" max="${maxFin}"
                data-min-msg="La fecha de fin no puede ser anterior a hoy." required>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="field">
              <label class="label">Costo Matrícula (S/)</label>
              <input type="number" step="0.01" min="0" max="500" name="matricula" class="input" value="${c?.matricula ?? 150}" required>
            </div>
            <div class="field">
              <label class="label">Pensión Mensual (S/)</label>
              <input type="number" step="0.01" min="1" max="500" name="pension" class="input" value="${c?.pension ?? 400}" required>
            </div>
            <div class="field">
              <label class="label">N° de Pensiones</label>
              <input type="number" step="1" min="1" max="10" name="cuotas" class="input" value="${c?.cuotas ?? 4}" required>
            </div>
          </div>

          <div class="modal-footer -mx-6 -mb-6 mt-6">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Guardar Ciclo</button>
          </div>
        </form>
      `;

      UI.openModal({
        title: c ? `Editar Ciclo ${c.nombre}` : 'Nuevo Ciclo Académico y Tarifas',
        icon: 'fa-calendar-plus',
        body: html,
        size: 'lg'
      });

      document.getElementById('form-cic').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
          programaId: fd.get('programaId'),
          nombre: fd.get('nombre').trim(),
          modalidad: fd.get('modalidad'),
          fechaInicio: fd.get('fechaInicio'),
          fechaFin: fd.get('fechaFin'),
          matricula: parseFloat(fd.get('matricula')) || 0,
          pension: parseFloat(fd.get('pension')) || 0,
          cuotas: parseInt(fd.get('cuotas')) || 4,
          activo: true
        };
        if (c) {
          db.update('ciclos', c.id, data);
          audit(`Actualizó ciclo ${data.nombre}`, 'Configuración Académica');
        } else {
          db.insert('ciclos', data, 'cic');
          audit(`Creó nuevo ciclo ${data.nombre}`, 'Configuración Académica');
        }
        UI.closeModal();
        UI.toast('Ciclo guardado exitosamente');
        Shell.refresh();
      });
    }
  };

  /* ------------------------------------------------------------------
     9. AUDITORÍA (Logs de Sistema de Solo Lectura)
     ------------------------------------------------------------------ */
  const AuditoriaView = {
    title: 'Auditoría del Sistema',
    subtitle: 'Registro inmutable de acciones administrativas y cambios sensibles en el sistema',
    render(params) {
      const logs = db.all('auditoria').slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
      const busqueda = (params.q || '').toLowerCase();
      const modFiltro = params.mod || '';

      const modulos = Array.from(new Set(logs.map(l => l.modulo).filter(Boolean)));

      const filtrados = logs.filter(l => {
        if (modFiltro && l.modulo !== modFiltro) return false;
        if (busqueda) {
          const t = `${l.admin} ${l.accion} ${l.modulo} ${l.motivo}`.toLowerCase();
          if (!t.includes(busqueda)) return false;
        }
        return true;
      });

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Trazabilidad y Logs de Operación</h3>
              <p class="page-desc">Registros protegidos contra modificación directa: ${logs.length} eventos auditados</p>
            </div>
          </div>

          <div class="filters" style="--fcols:1">
            <div class="input-icon">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" id="filtro-aud-q" class="input" placeholder="Buscar por administrador, acción o motivo..." value="${fmt.esc(params.q || '')}">
            </div>
            <select id="filtro-aud-mod" class="select">
              <option value="">Todos los módulos auditados</option>
              ${modulos.map(m => `<option value="${m}" ${modFiltro === m ? 'selected' : ''}>${fmt.esc(m)}</option>`).join('')}
            </select>
          </div>

          ${filtrados.length === 0 ? UI.empty('No se encontraron registros de auditoría.') : UI.table({
            cols: [
              { label: 'Fecha y Hora' },
              { label: 'Administrador' },
              { label: 'Módulo' },
              { label: 'Acción Ejecutada' },
              { label: 'Motivo / Detalle' }
            ],
            rows: filtrados.map(l => [
              `<span class="text-xs font-mono font-bold">${fmt.dateTime(l.fecha)}</span>`,
              `<b>${fmt.esc(l.admin)}</b>`,
              `<span class="badge badge-info">${fmt.esc(l.modulo)}</span>`,
              `<span class="font-semibold text-slate-800">${fmt.esc(l.accion)}</span>`,
              `<span class="text-xs text-slate-600">${fmt.esc(l.motivo || '—')}</span>`
            ])
          })}
        </div>
      `;
    },
    mount(params, root) {
      const applyFilters = () => {
        Shell.go('auditoria', {
          q: document.getElementById('filtro-aud-q').value.trim(),
          mod: document.getElementById('filtro-aud-mod').value
        });
      };

      document.getElementById('filtro-aud-q').addEventListener('input', fmt.debounce(applyFilters, 300));
      document.getElementById('filtro-aud-mod').addEventListener('change', applyFilters);
    }
  };

  /* ------------------------------------------------------------------
     Inicialización del Router y Vistas
     ------------------------------------------------------------------ */
  const views = {
    dashboard: DashboardView,
    matriculas: MatriculasView,
    estudiantes: EstudiantesView,
    pensiones: PensionesView,
    pagos: PagosView,
    reportes: ReportesView,
    usuarios: UsuariosView,
    configuracion: ConfiguracionView,
    auditoria: AuditoriaView
  };

  Shell.init({
    views,
    defaultView: 'dashboard',
    user: admin,
    onRender: () => {
      updatePendingBadge();
    }
  });

  updatePendingBadge();
})();