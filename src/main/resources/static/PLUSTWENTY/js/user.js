/* =====================================================================
   PLUSTWENTY · user.js
   Lógica del portal de estudiante / apoderado (7 vistas completas SPA):
   1. Inicio (KPIs, próximo vencimiento, notificaciones recientes)
   2. Mis Matrículas (ciclos actuales y pasados de solo lectura)
   3. Mis Pensiones (desglose de cuotas, saldos y botón directo a pagar)
   4. Historial de Pagos (estados de verificación y recibo interno oficial)
   5. Reportar Pago (Yape/Plin, subida base64, comprobante interactivo)
   6. Mi Perfil (edición de contacto, DNI de solo lectura, cambio de clave)
   7. Notificaciones (centro de avisos con marcar como leída)
   ===================================================================== */

(function () {
  'use strict';

  const { db, finance, auth, UI, Shell, docs, fmt, validators, notificaciones, Pila, RULES } = window.PT;
  const user = auth.require('user');
  if (!user) return;

  // Estudiante asociado al usuario autenticado (Separación estricta de datos)
  const estudiante = user.estudianteId ? db.find('estudiantes', user.estudianteId) : null;
  if (!estudiante) {
    document.body.innerHTML = '<div class="p-8 text-center"><h2 class="text-xl font-bold text-red-600">Error de Vinculación</h2><p class="mt-2 text-slate-600">Esta cuenta no tiene un expediente de estudiante asociado.</p><button class="btn btn-primary mt-4" onclick="PT.auth.logout()">Salir</button></div>';
    return;
  }

  /* Contador de notificaciones no leídas */
  function updateNotifBadges() {
    const unread = notificaciones.cachedCount();
    const txt = unread > 0 ? String(unread) : '';
    const elNav = document.getElementById('nav-badge-notif');
    const elTop = document.getElementById('top-badge-notif');
    if (elNav) elNav.textContent = txt;
    if (elTop) elTop.textContent = txt;
  }

  /* ------------------------------------------------------------------
     1. INICIO (Dashboard de Estudiante)
     ------------------------------------------------------------------ */
  const InicioView = {
    title: 'Mi Portal Académico',
    subtitle: `Bienvenido(a), ${estudiante.nombres}`,
    render() {
      const res = finance.resumen(estudiante.id);
      const hab = finance.habilitadas(estudiante.id, db.all('pagos'));
      const irPagar = hab.primera ? `reportar?penId=${hab.primera.id}` : 'reportar';
      const prg = db.find('programas', estudiante.programaId);
      const cic = db.find('ciclos', estudiante.cicloId);
      const ultimasNotifs = notificaciones.list(0, 3);

      return `
        <div class="stagger space-y-6">
          <!-- Hero de Bienvenida -->
          <div class="hero">
            <div class="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <span class="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100 font-semibold mb-3 border border-white/20">
                  <span class="w-2 h-2 rounded-full bg-emerald-400"></span> Alumno(a) Activo(a)
                </span>
                <h3 class="text-2xl md:text-3xl font-extrabold tracking-tight">${fmt.esc(estudiante.nombres)} ${fmt.esc(estudiante.apellidos)}</h3>
                <p class="text-blue-100 text-sm mt-1">
                  <i class="fa-solid fa-graduation-cap"></i> ${fmt.esc(prg?.nombre || 'Programa General')} · Ciclo ${fmt.esc(cic?.nombre || '2026-II')} (${fmt.esc(cic?.modalidad || 'Regular')})
                </p>
                <p class="text-xs text-blue-200 mt-2 font-mono">DNI: ${estudiante.dni} | Código: ${estudiante.codigo || '—'}</p>
              </div>

              <div class="flex items-center gap-3">
                <button class="btn btn-success btn-lg shadow-xl" data-go="reportar">
                  <i class="fa-solid fa-money-bill-transfer"></i>
                  <span>Reportar Pago con Yape / Plin</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Alerta de Vencimiento si aplica -->
          ${res.montoVencido > 0 ? `
            <div class="alert alert-danger flex items-center justify-between">
              <div class="flex items-center gap-3">
                <i class="fa-solid fa-triangle-exclamation text-2xl text-red-600"></i>
                <div>
                  <p class="font-extrabold text-base">Presenta ${res.vencidas.length} cuota(s) vencida(s) por un total de ${fmt.money(res.montoVencido)}${res.mora > 0 ? ` <span class="font-semibold">(incluye mora de ${fmt.money(res.mora)})</span>` : ''}</p>
                  <p class="text-xs text-red-700">Por favor regularice su pago a la brevedad para no perjudicar su acceso a simulacros y plataforma.</p>
                </div>
              </div>
              <button class="btn btn-danger btn-sm" data-go="${irPagar}">Pagar Ahora</button>
            </div>
          ` : (res.proximo ? `
            <div class="alert alert-info flex items-center justify-between">
              <div class="flex items-center gap-3">
                <i class="fa-solid fa-calendar-check text-2xl text-brand"></i>
                <div>
                  <p class="font-bold">Próximo vencimiento: ${fmt.esc(res.proximo.concepto)} (${fmt.money(res.proximo.saldo)})</p>
                  <p class="text-xs text-blue-700">Vence el ${fmt.date(res.proximo.fechaVencimiento)}.</p>
                </div>
              </div>
              <button class="btn btn-primary btn-sm" data-go="${irPagar}">Pagar Cuota</button>
            </div>
          ` : `
            <div class="alert alert-success">
              <i class="fa-solid fa-circle-check ai"></i>
              <div><b>¡Al día!</b> No presenta cuotas pendientes de pago en este momento.</div>
            </div>
          `)}

          <!-- KPIs Principales -->
          <div class="kpi-grid">
            ${UI.kpi({ icon: 'fa-id-card', label: 'Estado de Matrícula', value: res.matriculaActiva ? 'Activa' : 'Inactiva', hint: res.matriculaActiva?.codigo || 'Sin matrícula', tone: 'navy' })}
            ${UI.kpi({ icon: 'fa-circle-check', label: 'Total Pagado Aprobado', value: fmt.money(res.totalPagado), hint: `${res.cuotasPagadas} de ${res.cuotasTotal} cuotas canceladas`, tone: 'green' })}
            ${UI.kpi({ icon: 'fa-clock', label: 'Saldo Pendiente', value: fmt.money(res.saldoTotal), hint: [res.mora > 0 ? `incl. mora ${fmt.money(res.mora)}` : '', res.enRevision > 0 ? `(${fmt.money(res.enRevision)} en revisión)` : (res.mora > 0 ? '' : 'Sin pagos en cola')].filter(Boolean).join(' · '), tone: res.saldoTotal > 0 ? 'amber' : 'blue' })}
            ${UI.kpi({ icon: 'fa-calendar-days', label: 'Próxima Cuota', value: res.proximo ? fmt.date(res.proximo.fechaVencimiento) : 'Completado', hint: res.proximo?.concepto || 'Todo cancelado', tone: 'blue' })}
          </div>

          <!-- Dos Columnas: Notificaciones y Resumen Rápido -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Notificaciones Recientes -->
            <div class="card">
              <div class="card-head">
                <h4 class="card-title"><i class="fa-solid fa-bell"></i> Avisos y Notificaciones</h4>
                <a href="#notificaciones" class="btn btn-secondary btn-sm" data-go="notificaciones">Ver todas</a>
              </div>
              ${ultimasNotifs.length === 0 ? UI.empty('No tienes notificaciones recientes.') : `
                <div class="space-y-3">
                  ${ultimasNotifs.map(n => `
                    <div class="notif ${n.leida ? '' : 'unread'}">
                      <div class="icon-bubble ${n.tipo === 'success' ? 'ib-success' : n.tipo === 'danger' ? 'ib-danger' : 'ib-info'}">
                        <i class="fa-solid ${n.tipo === 'success' ? 'fa-check' : n.tipo === 'danger' ? 'fa-xmark' : 'fa-bell'}"></i>
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center justify-between gap-2">
                          <p class="font-bold text-sm text-slate-800">${fmt.esc(n.titulo)}</p>
                          <span class="text-[11px] text-slate-400 whitespace-nowrap">${fmt.timeAgo(n.fecha)}</span>
                        </div>
                        <p class="text-xs text-slate-600 mt-1 leading-relaxed">${fmt.esc(n.mensaje)}</p>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Progreso de Pago del Ciclo -->
            <div class="card space-y-4">
              <div class="card-head">
                <h4 class="card-title"><i class="fa-solid fa-chart-line"></i> Progreso de Pago del Ciclo</h4>
                <a href="#pensiones" class="btn btn-secondary btn-sm" data-go="pensiones">Ver detalle</a>
              </div>
              <p class="text-xs text-slate-500">Avance de abonos sobre el total exigible de este ciclo:</p>
              ${(() => {
                const pct = res.exigible > 0 ? (res.totalPagado / res.exigible) * 100 : 100;
                return `
                  <div>
                    <div class="flex items-center justify-between text-xs font-bold mb-2">
                      <span>Progreso: ${Math.round(pct)}%</span>
                      <span>${fmt.money(res.totalPagado)} de ${fmt.money(res.exigible)}</span>
                    </div>
                    ${UI.progress(pct)}
                  </div>
                `;
              })()}

              <div class="grid grid-cols-2 gap-3 pt-2">
                <div class="mini-stat">
                  <p class="ms-label">Cuotas Canceladas</p>
                  <p class="ms-value text-emerald-600">${res.cuotasPagadas} / ${res.cuotasTotal}</p>
                </div>
                <div class="mini-stat">
                  <p class="ms-label">Pagos en Verificación</p>
                  <p class="ms-value text-blue-600">${fmt.money(res.enRevision)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  };

  /* ------------------------------------------------------------------
     2. MIS MATRÍCULAS
     ------------------------------------------------------------------ */
  const MatriculasView = {
    title: 'Mis Matrículas',
    subtitle: 'Historial académico de matrículas registradas en la academia',
    render() {
      const matriculas = db.where('matriculas', m => m.estudianteId === estudiante.id).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Padrón de Mis Matrículas</h3>
              <p class="page-desc">Información oficial de tus ciclos cursados en PLUSTWENTY</p>
            </div>
          </div>

          ${matriculas.length === 0 ? UI.empty('No tienes matrículas registradas.') : UI.table({
            cols: [
              { label: 'Código de Matrícula' },
              { label: 'Programa Académico' },
              { label: 'Ciclo' },
              { label: 'Fecha de Registro' },
              { label: 'Monto Matrícula', cls: 'num' },
              { label: 'Estado' },
              { label: 'Observación' }
            ],
            rows: matriculas.map(m => {
              const prg = db.find('programas', m.programaId);
              const cic = db.find('ciclos', m.cicloId);
              return [
                `<span class="font-extrabold text-navy font-mono">${fmt.esc(m.codigo)}</span>`,
                `<b>${fmt.esc(prg?.nombre || '—')}</b> (${fmt.esc(prg?.siglas || '')})`,
                `<span class="badge badge-info">${fmt.esc(cic?.nombre || '—')} (${fmt.esc(cic?.modalidad || '')})</span>`,
                fmt.date(m.fecha),
                `<span class="font-bold">${fmt.money(m.montoMatricula)}</span>`,
                UI.badge(m.estado),
                `<span class="text-xs text-slate-500">${fmt.esc(m.observacion || 'Conforme')}</span>`
              ];
            })
          })}
        </div>
      `;
    }
  };

  /* ------------------------------------------------------------------
     3. MIS PENSIONES
     ------------------------------------------------------------------ */
  const PensionesView = {
    title: 'Mis Pensiones y Obligaciones',
    subtitle: 'Cronograma de pagos, fechas límite de vencimiento y abonos',
    render() {
      const res = finance.resumen(estudiante.id);
      const habilitadas = finance.habilitadas(estudiante.id, db.all('pagos'));

      return `
        <div class="card space-y-5">
          <div class="page-head">
            <div>
              <h3 class="page-title">Cronograma Financiero de Cuotas</h3>
              <p class="page-desc">Consulte sus cuotas y reporte los comprobantes de pago de forma oportuna</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" data-go="reportar">
                <i class="fa-solid fa-plus"></i> Reportar Nuevo Pago
              </button>
            </div>
          </div>

          ${habilitadas.primera && res.pensiones.some(p => p.disponible > 0 && !habilitadas.ids.has(p.id)) ? `
            <div class="alert alert-info text-sm">
              <i class="fa-solid fa-list-ol ai"></i>
              <div><b>Las cuotas se pagan en orden.</b> Ahora corresponde pagar <b>${fmt.esc(habilitadas.primera.concepto)}</b>; las siguientes se habilitan al cancelar la anterior.</div>
            </div>` : ''}
          ${res.pensiones.length === 0 ? UI.empty('No se encontraron obligaciones registradas.') : UI.table({
            cols: [
              { label: 'Concepto de Pago' },
              { label: 'Fecha Vence' },
              { label: 'Importe Base', cls: 'num' },
              { label: 'Abonado', cls: 'num' },
              { label: 'Saldo Pendiente', cls: 'num' },
              { label: 'Estado' },
              { label: 'Acción', cls: 'nowrap text-right' }
            ],
            rows: res.pensiones.map(p => {
              const hasSaldo = p.saldo > 0;
              const puedePagar = p.disponible > 0 && habilitadas.ids.has(p.id);
              const bloqueada = p.disponible > 0 && !habilitadas.ids.has(p.id);
              return [
                `<div>
                  <span class="font-bold text-slate-800">${fmt.esc(p.concepto)}</span>
                  ${p.enRevision > 0 ? `<p class="text-[11px] text-blue-600 font-semibold"><i class="fa-solid fa-hourglass-half"></i> ${fmt.money(p.enRevision)} en revisión</p>` : ''}
                </div>`,
                `<div>
                  <span class="text-xs font-semibold ${p.estado === 'Vencida' ? 'text-red-600 font-bold' : ''}">${fmt.date(p.fechaVencimiento)}</span>
                  ${p.diasAtraso > 0 ? `<p class="text-[10px] text-red-500 font-bold">${p.diasAtraso} días atraso</p>` : ''}
                </div>`,
                fmt.money(p.importe),
                `<span class="font-bold text-emerald-700">${fmt.money(p.abonado)}</span>`,
                UI.saldoMora(p),
                UI.badge(p.estado),
                `<div class="actions">
                  ${puedePagar ? `
                    <button class="btn btn-primary btn-sm" data-pay-pen="${p.id}">
                      <i class="fa-solid fa-credit-card"></i> Pagar
                    </button>
                  ` : bloqueada ? `
                    <button class="btn btn-secondary btn-sm" disabled aria-disabled="true"
                      title="Primero debe pagar la cuota más antigua: ${fmt.esc(habilitadas.primera ? habilitadas.primera.concepto : '')}">
                      <i class="fa-solid fa-lock"></i> Pagar
                    </button>
                  ` : hasSaldo ? `
                    <span class="text-xs text-blue-600 font-bold"><i class="fa-solid fa-hourglass-half"></i> En revisión</span>
                  ` : `
                    <span class="text-xs text-emerald-600 font-bold"><i class="fa-solid fa-check-double"></i> Cancelado</span>
                  `}
                </div>`
              ];
            }),
            foot: `<tfoot><tr><td colspan="5" class="text-right">SALDO TOTAL PENDIENTE${res.mora > 0 ? ` <span class="mora-tag">(incl. mora ${fmt.money(res.mora)})</span>` : ''}:</td><td class="num font-extrabold text-red-600">${fmt.money(res.saldoTotal)}</td><td colspan="2"></td></tr></tfoot>`
          })}
        </div>
      `;
    },
    mount(params, root) {
      root.addEventListener('click', e => {
        const btnP = e.target.closest('[data-pay-pen]');
        if (btnP) {
          Shell.go('reportar', { penId: btnP.dataset.payPen });
        }
      });
    }
  };

  /* ------------------------------------------------------------------
     4. HISTORIAL DE PAGOS
     ------------------------------------------------------------------ */
  const HistorialView = {
    title: 'Historial de Pagos',
    subtitle: 'Comprobantes reportados, estado de auditoría y recibos oficiales',
    render(params = {}) {
      const q = params.q || '';
      const estadoF = ['Pendiente', 'Aprobado', 'Rechazado'].includes(params.estado) ? params.estado : '';
      // Pila (LIFO): el último pago reportado es el primero que se ve.
      const todos = Pila.desde(db.where('pagos', p => p.estudianteId === estudiante.id).slice()
        .sort((a, b) => a.fechaReporte.localeCompare(b.fechaReporte))).toArray();
      const tokens = fmt.norm(q).split(/\s+/).filter(Boolean);
      const pagos = todos.filter(p => {
        if (estadoF && p.estado !== estadoF) return false;
        if (!tokens.length) return true;
        const pen = db.find('pensiones', p.pensionId);
        const hay = fmt.norm(`${pen?.concepto || ''} ${p.metodo} ${p.numeroOperacion} ${p.reciboNumero || ''} ${p.estado} ${p.monto}`);
        return tokens.every(t => hay.includes(t));
      });
      const hayFiltro = !!(q || estadoF);

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Mis Pagos Reportados</h3>
              <p class="page-desc">Consulte el estado de aprobación de sus transferencias y descargue sus recibos</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" data-go="reportar">
                <i class="fa-solid fa-money-bill-transfer"></i> Reportar Nuevo Pago
              </button>
            </div>
          </div>

          ${todos.length === 0 ? '' : `
            <div class="filters" style="--fcols:1">
              <div class="input-icon">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="search" id="filtro-his-q" class="input" placeholder="Buscar por concepto, método, N° de operación o recibo..." value="${fmt.esc(q)}">
              </div>
              <select id="filtro-his-est" class="select" aria-label="Estado del pago">
                <option value="">Todos los estados</option>
                ${[['Pendiente', 'En revisión'], ['Aprobado', 'Aprobados'], ['Rechazado', 'Rechazados']].map(([v, l]) => `<option value="${v}" ${estadoF === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
            <p class="text-xs text-slate-500">
              <b class="text-slate-700">${pagos.length}</b> ${pagos.length === 1 ? 'pago' : 'pagos'}${hayFiltro ? ' con los filtros aplicados' : ''}
              · <span title="Pila (LIFO): el último pago reportado aparece primero"><i class="fa-solid fa-layer-group"></i> Más recientes primero</span>
            </p>`}

          ${todos.length === 0 ? UI.empty('No tienes pagos registrados en el historial.') : pagos.length === 0 ? UI.empty('No se encontraron pagos con la búsqueda aplicada.', 'fa-magnifying-glass') : UI.table({
            cols: [
              { label: 'Fecha Pago' },
              { label: 'Concepto' },
              { label: 'Método' },
              { label: 'N° Operación' },
              { label: 'Voucher' },
              { label: 'Monto Reportado', cls: 'num' },
              { label: 'Estado' },
              { label: 'Recibo / Acción', cls: 'nowrap text-right' }
            ],
            rows: pagos.map(p => {
              const pen = db.find('pensiones', p.pensionId);
              return [
                `<span class="text-xs font-bold text-slate-800">${fmt.date(p.fechaPago)}</span>`,
                `<b>${fmt.esc(pen?.concepto || 'Pensión')}</b>`,
                UI.method(p.metodo),
                `<code class="text-xs bg-slate-100 px-2 py-1 rounded font-bold">${fmt.esc(p.numeroOperacion)}</code>`,
                p.comprobante ? `
                  <button class="text-brand hover:underline text-xs font-bold inline-flex items-center gap-1" data-hist-voucher="${p.id}">
                    <i class="fa-solid fa-image"></i> Ver voucher
                  </button>
                ` : '<span class="text-xs text-slate-400">Efectivo</span>',
                `<span class="font-extrabold ${p.estado === 'Aprobado' ? 'text-emerald-600' : 'text-slate-800'}">${fmt.money(p.monto)}</span>`,
                `<div>
                  ${UI.badge(p.estado)}
                  ${p.motivoRechazo ? `<p class="text-[11px] text-red-600 mt-1 font-semibold max-w-[200px]" title="${fmt.esc(p.motivoRechazo)}">Obs: ${fmt.esc(p.motivoRechazo)}</p>` : ''}
                </div>`,
                `<div class="actions">
                  ${p.estado === 'Aprobado' ? `
                    <button class="btn btn-secondary btn-sm" data-hist-recibo="${p.id}">
                      <i class="fa-solid fa-receipt text-emerald-600"></i> ${p.reciboNumero || 'Recibo'}
                    </button>
                  ` : (p.estado === 'Rechazado' ? `
                    <button class="btn btn-primary btn-sm" data-go="reportar?penId=${p.pensionId}">
                      <i class="fa-solid fa-rotate-right"></i> Volver a reportar
                    </button>
                  ` : '<span class="text-xs text-amber-600 font-semibold"><i class="fa-solid fa-hourglass-half"></i> En revisión</span>')}
                </div>`
              ];
            })
          })}
        </div>
      `;
    },
    mount(params, root) {
      const fq = document.getElementById('filtro-his-q');
      const fe = document.getElementById('filtro-his-est');
      if (fq && fe) {
        const aplicar = () => Shell.go('historial', { q: fq.value.trim(), estado: fe.value });
        fq.addEventListener('input', fmt.debounce(aplicar, 300));
        fe.addEventListener('change', aplicar);
      }
      root.addEventListener('click', e => {
        const btnV = e.target.closest('[data-hist-voucher]');
        if (btnV) {
          const p = db.find('pagos', btnV.dataset.histVoucher);
          if (p?.comprobante) UI.viewImage(p.comprobante, `Voucher de Operación ${p.numeroOperacion}`);
          return;
        }
        const btnR = e.target.closest('[data-hist-recibo]');
        if (btnR) {
          HistorialView.modalRecibo(btnR.dataset.histRecibo);
        }
      });
    },

    modalRecibo(pagoId) {
      const p = db.find('pagos', pagoId);
      if (!p) return;
      const html = docs.recibo(pagoId);

      UI.openModal({
        title: `Recibo Interno ${p.reciboNumero || ''}`,
        subtitle: 'Comprobante digital emitido por Academia PLUSTWENTY',
        icon: 'fa-receipt',
        body: html,
        footer: `
          <button type="button" class="btn btn-secondary" data-close>Cerrar</button>
          <button type="button" class="btn btn-primary" onclick="PT.docs.printRecibo('${p.id}')">
            <i class="fa-solid fa-print"></i> Imprimir / Descargar PDF
          </button>
        `,
        size: 'md'
      });
    }
  };

  /* ------------------------------------------------------------------
     5. REPORTAR PAGO (Formulario Interactivo con Yape / Plin y Voucher)
     ------------------------------------------------------------------ */
  const ReportarView = {
    title: 'Reportar Pago',
    subtitle: 'Registre su transferencia por Yape o Plin adjuntando la captura del comprobante',
    render(params) {
      const pagosAll = db.all('pagos');
      const conSaldo = finance.pensionesDe(estudiante.id, pagosAll).filter(p => !p.anulada && p.saldo > 0);
      // Solo se puede reportar lo que aún no está cubierto ni en revisión (disponible > 0)
      const pensionesPendientes = conSaldo.filter(p => p.disponible > 0);
      // Orden de pago: solo se puede pagar la cuota más antigua pendiente; las demás aparecen bloqueadas.
      const habilitadas = finance.habilitadas(estudiante.id, pagosAll);
      // Desde "Pagar" (Mis Pensiones / Inicio) se paga SOLO esa cuota; desde el menú se listan todas.
      const pedida = params.penId ? pensionesPendientes.find(p => p.id === params.penId) : null;
      const pedidaBloqueada = !!pedida && !habilitadas.ids.has(pedida.id);
      // Si pidió una cuota bloqueada, se le lleva a la que corresponde pagar primero.
      const penFija = pedidaBloqueada ? habilitadas.primera : pedida;
      const fechaMin = fmt.addDays(fmt.today(), -RULES.diasPagoAtras);

      return `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Columna Izquierda: Formulario -->
          <div class="lg:col-span-2 space-y-6">
            <div class="card">
              <h3 class="card-title mb-4"><i class="fa-solid fa-receipt"></i> Formulario de Reporte de Pago</h3>

              ${pensionesPendientes.length === 0 ? (conSaldo.length > 0 ? `
                <div class="alert alert-info">
                  <i class="fa-solid fa-hourglass-half text-xl ai"></i>
                  <div><b>Pagos en revisión.</b> Todas tus cuotas pendientes ya tienen un pago reportado que está siendo verificado. Revisa su estado en el <a href="#historial" data-go="historial" class="font-bold underline">Historial de Pagos</a>.</div>
                </div>
              ` : `
                <div class="alert alert-success">
                  <i class="fa-solid fa-circle-check text-xl ai"></i>
                  <div><b>¡Felicitaciones!</b> No tienes pensiones ni cuotas pendientes de pago en este momento.</div>
                </div>
              `) : `
                <form id="form-reportar-pago" class="space-y-5">
                  ${pedidaBloqueada ? `
                  <div class="alert alert-warning text-sm" role="alert">
                    <i class="fa-solid fa-lock ai"></i>
                    <div><b>Primero debe pagar la cuota más antigua.</b> «${fmt.esc(pedida.concepto)}» se habilitará cuando cancele «${fmt.esc(habilitadas.primera.concepto)}».</div>
                  </div>` : ''}
                  <!-- Selección de Obligación -->
                  <div class="field">
                    <label class="label">Pensión / Cuota a Cancelar <span class="text-red-500">*</span></label>
                    ${penFija ? `
                      <!-- Llegó desde "Pagar": solo se muestra la cuota elegida (sin lista desplegable) -->
                      <div class="locked-field">
                        <i class="fa-solid fa-lock"></i>
                        <div class="min-w-0">
                          <p class="font-bold text-slate-800">${fmt.esc(penFija.concepto)}</p>
                          <p class="text-xs text-slate-500">Vence: ${fmt.date(penFija.fechaVencimiento)} · A pagar: <b>S/ ${penFija.disponible.toFixed(2)}</b>${penFija.mora > 0 ? ` <span class="mora-tag">(incl. mora S/ ${penFija.mora.toFixed(2)})</span>` : ''}</p>
                        </div>
                      </div>
                      <input type="hidden" name="pensionId" id="rep-pension" value="${penFija.id}" data-saldo="${penFija.disponible}">
                      ${habilitadas.ids.size > 1 ? `<button type="button" class="link-sutil" data-go="reportar"><i class="fa-solid fa-list"></i> ¿Desea pagar otra cuota? Ver todas mis cuotas pendientes</button>` : ''}
                    ` : `
                      <select name="pensionId" id="rep-pension" class="select" required>
                        <option value="">Seleccione la cuota que va a pagar...</option>
                        ${pensionesPendientes.map(p => habilitadas.ids.has(p.id) ? `
                          <option value="${p.id}" data-saldo="${p.disponible}">
                            ${fmt.esc(p.concepto)} — A pagar: S/ ${p.disponible.toFixed(2)}${p.mora > 0 ? ` (incl. mora S/ ${p.mora.toFixed(2)})` : ''} (Vence: ${fmt.date(p.fechaVencimiento)})
                          </option>` : `
                          <option value="${p.id}" disabled>
                            🔒 ${fmt.esc(p.concepto)} — Bloqueada: pague primero la cuota anterior
                          </option>`).join('')}
                      </select>
                    `}
                  </div>

                  <!-- Método de Pago -->
                  <div class="field">
                    <label class="label">Seleccione Método Utilizado <span class="text-red-500">*</span></label>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label class="method-card">
                        <input type="radio" name="metodo" value="Yape" checked>
                        <div class="method-logo yape">Y</div>
                        <div>
                          <p class="font-extrabold text-sm text-slate-800">Yape</p>
                          <p class="text-xs text-slate-500">${PT.ACADEMIA.yape}</p>
                        </div>
                        <div class="mc-check"><i class="fa-solid fa-check"></i></div>
                      </label>

                      <label class="method-card">
                        <input type="radio" name="metodo" value="Plin">
                        <div class="method-logo plin">P</div>
                        <div>
                          <p class="font-extrabold text-sm text-slate-800">Plin</p>
                          <p class="text-xs text-slate-500">${PT.ACADEMIA.plin}</p>
                        </div>
                        <div class="mc-check"><i class="fa-solid fa-check"></i></div>
                      </label>
                    </div>
                  </div>

                  <!-- Monto y Fecha -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="field">
                      <label class="label">Monto a Pagar (S/) <span class="text-xs text-slate-400 font-normal">(automático)</span></label>
                      <div class="input-prefix">
                        <span>S/</span>
                        <input type="text" name="monto" id="rep-monto" class="input font-extrabold text-lg text-navy" readonly tabindex="-1"
                               value="${penFija ? penFija.disponible.toFixed(2) : ''}" placeholder="Seleccione una cuota">
                      </div>
                      <span class="hint">El monto se toma del saldo de la cuota (más la mora, si corresponde) y no se puede modificar.</span>
                      <div id="rep-mora" class="hint-warn mora-incluye" hidden></div>
                    </div>
                    <div class="field">
                      <label class="label">Fecha en que realizó el pago <span class="text-red-500">*</span></label>
                      <input type="date" name="fechaPago" class="input" value="${fmt.today()}" min="${fechaMin}" max="${fmt.today()}" required>
                      <span class="hint">No se aceptan fechas de hace más de ${RULES.diasPagoAtras} días.</span>
                    </div>
                  </div>

                  <!-- N° de Operación -->
                  <div class="field">
                    <label class="label">Número de Operación <span class="text-red-500">*</span></label>
                    <div class="input-icon">
                      <i class="fa-solid fa-hashtag"></i>
                      <input type="text" inputmode="numeric" maxlength="6" pattern="\\d{6}" name="numeroOperacion" id="rep-op" class="input font-mono font-bold" placeholder="Ej: 482230" required>
                    </div>
                    <span class="hint">Código numérico que aparece en la constancia de su app bancaria.</span>
                    <p id="rep-op-aviso" class="hint-warn" hidden></p>
                  </div>

                  <!-- Subida de Comprobante / Dropzone -->
                  <div class="field">
                    <label class="label">Adjuntar Captura del Comprobante / Voucher <span class="text-red-500">*</span></label>
                    <div id="dropzone" class="dropzone">
                      <input type="file" id="rep-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="hidden">
                      <div id="dz-empty" class="space-y-2">
                        <div class="w-12 h-12 rounded-xl bg-blue-50 text-brand grid place-items-center mx-auto text-xl">
                          <i class="fa-solid fa-cloud-arrow-up"></i>
                        </div>
                        <p class="font-bold text-sm text-slate-700">Arrastre aquí su comprobante o haga clic para subir</p>
                        <p class="text-xs text-slate-400">PNG, JPG o WEBP (máx. 6 MB) · Se comprimirá automáticamente</p>
                      </div>
                      <div id="dz-preview" class="hidden">
                        <img id="dz-img" src="" alt="Voucher" class="max-h-48 mx-auto rounded-lg shadow border">
                        <button type="button" id="btn-remove-voucher" class="btn btn-secondary btn-sm mt-3">
                          <i class="fa-solid fa-rotate-left"></i> Cambiar imagen
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Alerta Informativa -->
                  <div class="alert alert-warning text-xs">
                    <i class="fa-solid fa-shield-halved ai text-amber-600 text-lg"></i>
                    <div>
                      <b>Verificación en plazo máximo de 24 horas:</b> Al enviar este formulario, el pago ingresará en estado <i>Pendiente de Verificación</i> y el personal de caja lo validará contra la cuenta bancaria.
                    </div>
                  </div>

                  <button type="submit" id="btn-submit-pago" class="btn btn-primary btn-block btn-lg">
                    <i class="fa-solid fa-paper-plane"></i>
                    <span>Enviar Reporte de Pago</span>
                  </button>
                </form>
              `}
            </div>
          </div>

          <!-- Columna Derecha: Canales de Pago de la Academia -->
          <div class="space-y-5">
            <div class="card space-y-4">
              <h4 class="card-title"><i class="fa-solid fa-wallet"></i> Cuentas Oficiales</h4>
              <p class="text-xs text-slate-500 leading-relaxed">Transfiera únicamente a las cuentas oficiales de la academia:</p>

              <!-- Yape Card -->
              <div class="p-4 rounded-xl border border-purple-200 bg-purple-50/50 space-y-2">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl yape text-white grid place-items-center font-extrabold">Y</div>
                  <div>
                    <p class="font-extrabold text-sm text-purple-950">Yape Academia</p>
                    <p class="text-lg font-black font-mono text-purple-900">${PT.ACADEMIA.yape}</p>
                  </div>
                </div>
                <p class="text-[11px] text-purple-800 font-semibold">Titular: <b>${PT.ACADEMIA.titular}</b></p>
              </div>

              <!-- Plin Card -->
              <div class="p-4 rounded-xl border border-cyan-200 bg-cyan-50/50 space-y-2">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl plin text-white grid place-items-center font-extrabold">P</div>
                  <div>
                    <p class="font-extrabold text-sm text-cyan-950">Plin Academia</p>
                    <p class="text-lg font-black font-mono text-cyan-900">${PT.ACADEMIA.plin}</p>
                  </div>
                </div>
                <p class="text-[11px] text-cyan-800 font-semibold">Titular: <b>${PT.ACADEMIA.titular}</b></p>
              </div>

              <div class="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-1 border">
                <p class="font-bold text-slate-800"><i class="fa-solid fa-circle-question text-brand"></i> Pasos para pagar:</p>
                <ol class="list-decimal pl-4 space-y-1">
                  <li>Abre Yape o Plin y envía el importe de tu cuota al número oficial.</li>
                  <li>Toma una captura de pantalla clara al comprobante generado.</li>
                  <li>Copia el número de operación y adjunta la captura en este formulario.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      `;
    },
    mount(params, root) {
      const selP = document.getElementById('rep-pension');
      const inMonto = document.getElementById('rep-monto');
      const dropzone = document.getElementById('dropzone');
      const fileInput = document.getElementById('rep-file');
      const dzEmpty = document.getElementById('dz-empty');
      const dzPrev = document.getElementById('dz-preview');
      const dzImg = document.getElementById('dz-img');
      const btnRemove = document.getElementById('btn-remove-voucher');

      let voucherBase64 = null;

      const repOp = document.getElementById('rep-op');
      repOp?.addEventListener('input', e => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
      });

      const form = document.getElementById('form-reportar-pago');
      const avisoOp = document.getElementById('rep-op-aviso');
      const fechaMin = fmt.addDays(fmt.today(), -RULES.diasPagoAtras);

      // El monto es automático (saldo disponible de la cuota) y no se puede editar.
      // Monto = saldo de la cuota + mora calculada hasta la FECHA DE PAGO elegida (quien pagó a tiempo no paga mora de más).
      const calcular = () => {
        const pen = selP && selP.value ? db.find('pensiones', selP.value) : null;
        if (!pen) return null;
        const inf = finance.info(pen, db.all('pagos'));
        const f = form?.elements.fechaPago?.value;
        const fecha = (f && f <= fmt.today()) ? f : fmt.today();
        const mora = inf.moraFija ? inf.mora : finance.moraA(inf, fecha);
        return { inf, fecha, mora, monto: finance.disponibleA(inf, fecha) };
      };
      const updateMonto = () => {
        const c = calcular();
        inMonto.value = c ? c.monto.toFixed(2) : '';
        const box = document.getElementById('rep-mora');
        if (!box) return;
        if (c && c.mora > 0) {
          const d = finance.moraDetalle(c.inf, c.fecha);
          box.hidden = false;
          box.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>Incluye <b>mora de ${fmt.money(c.mora)}</b> (${d.diasMora} ${d.diasMora === 1 ? 'día' : 'días'} con mora, hasta el ${fmt.date(c.fecha)})</span>
            <button type="button" class="mora-eye" data-mora="${c.inf.id}" data-mora-fecha="${c.fecha}" title="Ver cuánto aumentó por mora" aria-label="Ver cuánto aumentó por mora"><i class="fa-solid fa-eye"></i></button>`;
        } else box.hidden = true;
      };
      if (selP) { selP.addEventListener('change', updateMonto); updateMonto(); }
      form?.elements.fechaPago?.addEventListener('input', updateMonto);
      form?.elements.fechaPago?.addEventListener('change', updateMonto);

      // N° de operación repetido: solo cuenta dentro del MISMO método (el mismo código en Yape y en Plin es válido).
      const metodoActual = () => form?.querySelector('input[name="metodo"]:checked')?.value || 'Yape';
      const existeDuplicado = (op, metodo) =>
        db.all('pagos').some(p => p.metodo === metodo && p.estado !== 'Rechazado' && String(p.numeroOperacion).trim() === op);
      const revisarDuplicado = () => {
        if (!avisoOp) return;
        const op = (repOp?.value || '').trim();
        const m = metodoActual();
        const dup = /^\d{6}$/.test(op) && existeDuplicado(op, m);
        avisoOp.hidden = !dup;
        if (dup) avisoOp.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> El N° de operación <b>${fmt.esc(op)}</b> ya fue reportado con <b>${fmt.esc(m)}</b>. Verifique que sea correcto.`;
      };
      repOp?.addEventListener('input', revisarDuplicado);
      form?.querySelectorAll('input[name="metodo"]').forEach(r => r.addEventListener('change', revisarDuplicado));

      // Manejo de Dropzone y carga de comprobante
      if (dropzone && fileInput) {
        dropzone.addEventListener('click', e => {
          if (e.target !== btnRemove && !btnRemove?.contains(e.target)) fileInput.click();
        });

        dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
        dropzone.addEventListener('drop', e => {
          e.preventDefault();
          dropzone.classList.remove('drag');
          if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });

        fileInput.addEventListener('change', () => {
          if (fileInput.files.length) handleFile(fileInput.files[0]);
        });

        async function handleFile(file) {
          try {
            voucherBase64 = await UI.fileToDataURL(file, 800, 0.7);
            dropzone.classList.remove('invalid');
            dzImg.src = voucherBase64;
            dzEmpty.classList.add('hidden');
            dzPrev.classList.remove('hidden');
            UI.toast('Comprobante cargado correctamente');
          } catch (err) {
            UI.alert('Error con la imagen', err.message, 'error');
          }
        }

        btnRemove?.addEventListener('click', e => {
          e.stopPropagation();
          voucherBase64 = null;
          fileInput.value = '';
          dzImg.src = '';
          dzPrev.classList.add('hidden');
          dzEmpty.classList.remove('hidden');
        });
      }

      // Envío de formulario (los errores de campo ya los validó Forms antes de llegar aquí)
      form?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(form);
        const pensionId = fd.get('pensionId');
        const metodo = fd.get('metodo');
        const numeroOperacion = String(fd.get('numeroOperacion') || '').trim();
        const fechaPago = fd.get('fechaPago');

        // El monto NO se toma del formulario: se recalcula desde el saldo real de la cuota.
        const pen = db.find('pensiones', pensionId);
        const info = pen && pen.estudianteId === estudiante.id ? finance.info(pen, db.all('pagos')) : null;
        if (!info || info.disponible <= 0) {
          return UI.alert('Cuota no disponible', 'Esta cuota ya no tiene saldo disponible para reportar (está cancelada o ya tiene un pago en revisión).', 'warning');
        }
        const fPago = (fechaPago && fechaPago <= fmt.today()) ? fechaPago : fmt.today();
        const monto = finance.disponibleA(info, fPago);
        if (!(monto > 0)) {
          return UI.alert('Cuota no disponible', 'Esta cuota ya no tiene saldo disponible para reportar.', 'warning');
        }
        const moraPago = info.moraFija ? info.mora : finance.moraA(info, fPago);
        const orden = finance.habilitadas(estudiante.id, db.all('pagos'));
        if (!orden.ids.has(pensionId)) {
          return UI.alert('Cuota no habilitada', `Las cuotas se pagan en orden. Primero debe pagar «${orden.primera ? orden.primera.concepto : 'la cuota más antigua'}».`, 'warning');
        }

        if (!['Yape', 'Plin'].includes(metodo)) {
          return UI.alert('Método no válido', 'Seleccione Yape o Plin como método de pago.', 'warning');
        }
        if (!fechaPago || fechaPago > fmt.today() || fechaPago < fechaMin) {
          return UI.alert('Fecha no válida', `La fecha del pago no puede ser futura ni anterior a ${RULES.diasPagoAtras} días.`, 'warning');
        }
        if (!validators.operacion(numeroOperacion)) {
          return UI.alert('N° de Operación Inválido', 'El número de operación debe tener exactamente 6 dígitos numéricos.', 'warning');
        }
        if (!voucherBase64) {
          dropzone?.classList.add('invalid');
          dropzone?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return UI.alert('Falta el comprobante', 'Debe adjuntar la captura del comprobante o voucher para verificar la operación.', 'warning');
        }

        // Advertencia solo si el mismo número ya se reportó con el mismo método de pago
        if (existeDuplicado(numeroOperacion, metodo)) {
          const conf = await UI.confirm({
            title: '¿Número de Operación Duplicado?',
            text: `El número de operación ${numeroOperacion} ya figura registrado con ${metodo}. ¿Está seguro de que desea reportarlo nuevamente?`,
            icon: 'warning'
          });
          if (!conf) return;
        }

        await PT.Cargando.ejecutar(() => {
        db.insert('pagos', {
          pensionId,
          estudianteId: estudiante.id,
          monto,
          metodo,
          numeroOperacion,
          fechaPago,
          comprobante: voucherBase64,
          estado: 'Pendiente',
          motivoRechazo: '',
          observacion: 'Reportado por estudiante/apoderado' + (moraPago > 0 ? ` · Incluye mora de ${fmt.money(moraPago)} (${finance.moraDetalle(info, fPago).diasMora} días con mora)` : ''),
          fechaReporte: fmt.nowISO(),
          registradoPor: 'usuario',
          revisadoPor: null,
          fechaRevision: null,
          reciboNumero: null
        }, 'pag');

        // Notificación al usuario
        PT.notify(user.id, {
          titulo: 'Pago Reportado en Revisión',
          mensaje: `Hemos recibido tu reporte de pago de ${fmt.money(monto)} por "${pen?.concepto || 'Cuota'}". Será validado en las próximas horas.`,
          tipo: 'info',
          link: 'historial'
        });
        }, 'Enviando tu pago…');

        UI.alert('¡Pago Reportado con Éxito!', '', 'success',
          '<p>Tu pago ha sido registrado y ha entrado a la cola de verificación del personal administrativo.</p>' +
          '<p style="margin-top:.9rem">Recibirás una notificación cuando sea aprobado y tu recibo oficial sea generado.</p>')
          .then(() => {
            Shell.go('historial');
          });
      });
    }
  };

  /* ------------------------------------------------------------------
     6. MI PERFIL
     ------------------------------------------------------------------ */
  const PerfilView = {
    title: 'Mi Perfil de Usuario',
    subtitle: 'Actualización de datos de contacto y seguridad de la cuenta',
    render() {
      const prg = db.find('programas', estudiante.programaId);
      const cic = db.find('ciclos', estudiante.cicloId);

      return `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Tarjeta de Identidad (Solo Lectura) -->
          <div class="card space-y-4">
            <div class="text-center pb-4 border-b">
              <div class="avatar avatar-lg mx-auto mb-3">${fmt.initials(estudiante.nombres + ' ' + estudiante.apellidos)}</div>
              <h4 class="font-extrabold text-lg text-navy">${fmt.esc(estudiante.nombres)} ${fmt.esc(estudiante.apellidos)}</h4>
              <p class="text-xs text-brand font-semibold mt-1">${fmt.esc(prg?.nombre || 'Academia')} · ${fmt.esc(cic?.nombre || '')}</p>
              <div class="mt-3">${UI.badge(estudiante.activo ? 'Activo' : 'Inactivo')}</div>
            </div>

            <div class="space-y-3 text-xs">
              <div class="flex justify-between py-1 border-b">
                <span class="text-slate-500">DNI (Identidad)</span>
                <span class="font-mono font-bold text-slate-800">${estudiante.dni}</span>
              </div>
              <div class="flex justify-between py-1 border-b">
                <span class="text-slate-500">Código de Alumno</span>
                <span class="font-mono font-bold text-slate-800">${estudiante.codigo || '—'}</span>
              </div>
              <div class="flex justify-between py-1 border-b">
                <span class="text-slate-500">Colegio de Procedencia</span>
                <span class="font-semibold text-slate-800">${fmt.esc(estudiante.colegio || '—')}</span>
              </div>
              <div class="flex justify-between py-1">
                <span class="text-slate-500">Usuario de Acceso</span>
                <span class="font-mono font-bold text-brand">${fmt.esc(user.username)}</span>
              </div>
            </div>

            <div class="alert alert-info text-xs">
              <i class="fa-solid fa-lock ai"></i>
              <div>Por política de seguridad académica, el DNI y los nombres no son editables directamente. Acérquese a secretaría para rectificaciones.</div>
            </div>
          </div>

          <!-- Formularios: Datos de Contacto y Cambio de Clave -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Formulario de Contacto -->
            <div class="card">
              <h4 class="card-title mb-4"><i class="fa-solid fa-address-book"></i> Actualizar Datos de Contacto</h4>
              <form id="form-perfil-contacto" class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="field">
                    <label class="label">Teléfono / Celular <span class="text-red-500">*</span></label>
                    <input type="tel" inputmode="numeric" maxlength="9" pattern="\\d{9}" name="telefono" class="input" value="${fmt.esc(estudiante.telefono || '')}" required placeholder="987654321">
                  </div>
                  <div class="field">
                    <label class="label">Correo Electrónico <span class="text-red-500">*</span></label>
                    <input type="email" name="email" class="input" value="${fmt.esc(estudiante.email || '')}" required placeholder="correo@gmail.com">
                  </div>
                </div>

                <div class="field">
                  <label class="label">Dirección Domiciliaria</label>
                  <input type="text" name="direccion" data-v="direccion" minlength="5" maxlength="120" class="input" value="${fmt.esc(estudiante.direccion || '')}" placeholder="Av. Los Pinos 123">
                </div>

                <div class="section-label pt-2">Datos del Apoderado Responsable</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="field">
                    <label class="label">Nombre del Apoderado</label>
                    <input type="text" class="input" value="${fmt.esc(estudiante.apoderado?.nombre || '')}" readonly>
                  </div>
                  <div class="field">
                    <label class="label">Teléfono del Apoderado</label>
                    <input type="tel" inputmode="numeric" maxlength="9" pattern="\\d{9}" name="apo_telefono" class="input" value="${fmt.esc(estudiante.apoderado?.telefono || '')}" required placeholder="987654321">
                  </div>
                </div>

                <div class="flex justify-end pt-2">
                  <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Guardar Cambios de Contacto</button>
                </div>
              </form>
            </div>

            <!-- Formulario de Contraseña -->
            <div class="card">
              <h4 class="card-title mb-4"><i class="fa-solid fa-key"></i> Cambiar Contraseña</h4>
              <form id="form-cambio-clave" class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="field">
                    <label class="label">Contraseña Actual <span class="text-red-500">*</span></label>
                    <input type="password" name="actual" class="input" required maxlength="40" placeholder="••••••••">
                  </div>
                  <div class="field">
                    <label class="label">Nueva Contraseña (mín. 6 caracteres) <span class="text-red-500">*</span></label>
                    <input type="password" name="nueva" data-v="password" data-differs="actual" data-differs-msg="La nueva contraseña debe ser distinta a la actual." class="input" required minlength="6" placeholder="••••••••">
                  </div>
                </div>

                <div class="flex justify-end pt-2">
                  <button type="submit" class="btn btn-secondary"><i class="fa-solid fa-shield-halved"></i> Actualizar Contraseña</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
    },
    mount(params, root) {
      // Filtrar sólo dígitos en teléfonos de perfil
      root.querySelectorAll('input[name="telefono"], input[name="apo_telefono"]').forEach(input => {
        input.addEventListener('input', e => {
          e.target.value = e.target.value.replace(/\D/g, '').slice(0, 9);
        });
      });

      // Actualizar contacto
      document.getElementById('form-perfil-contacto')?.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const tel = fd.get('telefono').trim();
        const mail = fd.get('email').trim();
        const dir = fd.get('direccion').trim();
        const apoTel = fd.get('apo_telefono').trim();

        if (!validators.phone(tel) || !validators.phone(apoTel)) {
          return UI.alert('Teléfono inválido', 'El teléfono debe tener exactamente 9 dígitos numéricos.', 'error');
        }

        db.update('estudiantes', estudiante.id, {
          telefono: tel,
          email: mail,
          direccion: dir,
          apoderado: {
            ...estudiante.apoderado,
            telefono: apoTel
          }
        });

        // Actualizar email de usuario si coincide
        db.update('users', user.id, { email: mail });

        UI.toast('Datos de contacto actualizados correctamente');
      });

      // Cambiar clave
      document.getElementById('form-cambio-clave')?.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const act = fd.get('actual');
        const nue = fd.get('nueva');

        const cambio = PT.auth.changePassword(act, nue);
        if (!cambio.ok) {
          return UI.alert('Contraseña Incorrecta', cambio.error || 'La contraseña actual ingresada no coincide.', 'error');
        }

        UI.alert('Contraseña Cambiada', 'Tu contraseña ha sido actualizada con éxito.', 'success');
        e.target.reset();
      });
    }
  };

  /* ------------------------------------------------------------------
     7. NOTIFICACIONES
     ------------------------------------------------------------------ */
  const NotificacionesView = {
    title: 'Centro de Notificaciones',
    subtitle: 'Avisos de pagos, confirmaciones de recibos y comunicados académicos',
    render() {
      const notifs = notificaciones.list(0, 100);
      const unreadCount = notificaciones.count();

      return `
        <div class="card space-y-4">
          <div class="page-head">
            <div>
              <h3 class="page-title">Bandeja de Entrada</h3>
              <p class="page-desc">Tiene ${unreadCount} notificación(es) sin leer</p>
            </div>
            <div class="page-actions">
              ${unreadCount > 0 ? `
                <button class="btn btn-secondary btn-sm" id="btn-leer-todas">
                  <i class="fa-solid fa-envelope-open-text"></i> Marcar todas como leídas
                </button>
              ` : ''}
            </div>
          </div>

          ${notifs.length === 0 ? UI.empty('No tienes notificaciones en tu bandeja.', 'fa-bell-slash') : `
            <div class="space-y-3">
              ${notifs.map(n => `
                <div class="notif ${n.leida ? '' : 'unread'}">
                  <div class="icon-bubble ${n.tipo === 'success' ? 'ib-success' : n.tipo === 'danger' ? 'ib-danger' : n.tipo === 'warning' ? 'ib-warning' : 'ib-info'}">
                    <i class="fa-solid ${n.tipo === 'success' ? 'fa-check' : n.tipo === 'danger' ? 'fa-xmark' : n.tipo === 'warning' ? 'fa-triangle-exclamation' : 'fa-bell'}"></i>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                      <p class="font-bold text-slate-800 text-sm">${fmt.esc(n.titulo)}</p>
                      <span class="text-xs text-slate-400 whitespace-nowrap">${fmt.dateTime(n.fecha)}</span>
                    </div>
                    <p class="text-xs text-slate-600 mt-1 leading-relaxed">${fmt.esc(n.mensaje)}</p>
                    <div class="mt-3 flex items-center gap-3">
                      ${n.link ? `<button class="btn btn-secondary btn-sm" data-go="${n.link}">Ver en el sistema <i class="fa-solid fa-arrow-right ml-1"></i></button>` : ''}
                      ${!n.leida ? `<button class="text-xs text-brand font-semibold hover:underline" data-mark-read="${n.id}">Marcar como leída</button>` : '<span class="text-[11px] text-slate-400"><i class="fa-solid fa-check"></i> Leída</span>'}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;
    },
    mount(params, root) {
      document.getElementById('btn-leer-todas')?.addEventListener('click', () => {
        notificaciones.marcarTodas();
        updateNotifBadges();
        UI.toast('Todas las notificaciones marcadas como leídas');
        Shell.refresh();
      });

      root.addEventListener('click', e => {
        const btnM = e.target.closest('[data-mark-read]');
        if (btnM) {
          notificaciones.marcarLeida(btnM.dataset.markRead);
          updateNotifBadges();
          Shell.refresh();
        }
      });
    }
  };

  /* ------------------------------------------------------------------
     Inicialización del Router y Vistas
     ------------------------------------------------------------------ */
  const views = {
    inicio: InicioView,
    matriculas: MatriculasView,
    pensiones: PensionesView,
    historial: HistorialView,
    reportar: ReportarView,
    perfil: PerfilView,
    notificaciones: NotificacionesView
  };

  Shell.init({
    views,
    defaultView: 'inicio',
    user,
    onRender: () => {
      updateNotifBadges();
    }
  });

  updateNotifBadges();
})();