// Regla de negocio diferenciadora: ORDEN DE PAGO.
// El estudiante solo puede pagar la cuota habilitada más antigua de cada matrícula.
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarPT, iso } = require('./cargar-app');

const PT = cargarPT();
const { finance, db } = PT;

let contador = 0;
/** Crea un estudiante con tres cuotas de una matrícula: vencida hace 60 días, hace 30 días y a 30 días. */
function escenario(matricula = 'mat_1') {
  const est = 'est_orden_' + (++contador);
  const mk = (n, dias) => ({
    id: `${est}_${matricula}_${n}`, estudianteId: est, matriculaId: `${est}_${matricula}`, cicloId: 'cic_1',
    numeroCuota: n, tipo: 'Pensión', concepto: `Pensión ${n}/3`, importe: 400, descuento: 0,
    anulada: false, fechaVencimiento: iso(dias)
  });
  const cuotas = [mk(1, -60), mk(2, -30), mk(3, 30)];
  cuotas.forEach(c => db.all('pensiones').push(c));
  return { est, cuotas };
}
const pago = (c, monto, estado) => ({ id: 'pag_' + Math.random(), pensionId: c.id, estudianteId: c.estudianteId, monto, estado });

test('solo la cuota más antigua queda habilitada; las demás se bloquean', () => {
  const { est, cuotas } = escenario();
  const h = finance.habilitadas(est, []);
  assert.deepEqual([...h.ids], [cuotas[0].id]);
  assert.equal(h.primera.id, cuotas[0].id);
});

test('al aprobarse el pago de la primera, se habilita la segunda', () => {
  const { est, cuotas } = escenario();
  const mora = finance.info(cuotas[0], []).totalPagar;      // saldo + mora vigente
  const h = finance.habilitadas(est, [pago(cuotas[0], mora, 'Aprobado')]);
  assert.deepEqual([...h.ids], [cuotas[1].id]);
});

test('con un pago completo en revisión, la cuota ya no se puede pagar de nuevo y sigue la siguiente', () => {
  const { est, cuotas } = escenario();
  const total = finance.info(cuotas[0], []).totalPagar;
  const h = finance.habilitadas(est, [pago(cuotas[0], total, 'Pendiente')]);
  assert.ok(!h.ids.has(cuotas[0].id));
  assert.ok(h.ids.has(cuotas[1].id));
});

test('un pago rechazado no cuenta: la misma cuota sigue siendo la habilitada', () => {
  const { est, cuotas } = escenario();
  const h = finance.habilitadas(est, [pago(cuotas[0], 400, 'Rechazado')]);
  assert.deepEqual([...h.ids], [cuotas[0].id]);
});

test('una cuota anulada se omite y se habilita la siguiente', () => {
  const { est, cuotas } = escenario();
  cuotas[0].anulada = true;
  const h = finance.habilitadas(est, []);
  assert.deepEqual([...h.ids], [cuotas[1].id]);
});

test('con dos matrículas, cada una tiene su propia cuota habilitada', () => {
  const a = escenario('mat_a');
  // segunda matrícula del MISMO estudiante
  const extra = {
    id: a.est + '_mat_b_1', estudianteId: a.est, matriculaId: a.est + '_mat_b', cicloId: 'cic_2',
    numeroCuota: 1, tipo: 'Pensión', concepto: 'Pensión 1/2', importe: 300, descuento: 0, anulada: false,
    fechaVencimiento: iso(-5)
  };
  db.all('pensiones').push(extra);
  const h = finance.habilitadas(a.est, []);
  assert.equal(h.ids.size, 2);
  assert.ok(h.ids.has(a.cuotas[0].id));
  assert.ok(h.ids.has(extra.id));
});

test('la MATRÍCULA se paga primero, aunque su vencimiento sea posterior al de la Pensión 1', () => {
  const est = 'est_orden_matricula';
  const mid = est + '_mat';
  const mk = (id, n, tipo, concepto, dias) => ({
    id, estudianteId: est, matriculaId: mid, cicloId: 'cic_1', numeroCuota: n, tipo, concepto,
    importe: 150, descuento: 0, anulada: false, fechaVencimiento: iso(dias)
  });
  const matricula = mk(est + '_m', 0, 'Matrícula', 'Matrícula 2026-II', 10);   // vence DESPUÉS de la pensión 1
  const p1 = mk(est + '_p1', 1, 'Pensión', 'Pensión 1/2', -5);
  const p2 = mk(est + '_p2', 2, 'Pensión', 'Pensión 2/2', 25);
  [p1, matricula, p2].forEach(c => db.all('pensiones').push(c));

  let h = finance.habilitadas(est, []);
  assert.deepEqual([...h.ids], [matricula.id], 'solo la matrícula está habilitada');
  assert.equal(h.primera.id, matricula.id);

  // pagada la matrícula, se desbloquea la Pensión 1 (y la 2 sigue con candado)
  h = finance.habilitadas(est, [pago(matricula, 150, 'Aprobado')]);
  assert.deepEqual([...h.ids], [p1.id]);
});
