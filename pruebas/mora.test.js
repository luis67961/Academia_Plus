// Regla de negocio diferenciadora: MORA por pago atrasado.
//   1 % del saldo pendiente por cada día de atraso, con un tope del 20 % de la cuota.
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarPT, iso } = require('./cargar-app');

const PT = cargarPT();
const { finance } = PT;

const cuota = (extra = {}) => ({
  id: 'pen_x', estudianteId: 'est_x', matriculaId: 'mat_x', cicloId: 'cic_x', numeroCuota: 1,
  tipo: 'Pensión', concepto: 'Pensión 1/4', importe: 400, descuento: 0, anulada: false,
  fechaVencimiento: iso(-10), ...extra
});
const pago = (monto, estado) => ({ id: 'pag_' + Math.random(), pensionId: 'pen_x', estudianteId: 'est_x', monto, estado });

test('la regla vigente es 1 % diario con tope del 20 % y sin días de gracia', () => {
  assert.equal(PT.RULES.mora.tasaDiaria, 0.01);
  assert.equal(PT.RULES.mora.topePct, 0.20);
  assert.equal(PT.RULES.mora.diasGracia, 0);
});

test('cuota vencida hace 10 días: mora de 10 % (S/ 40) y total S/ 440', () => {
  const inf = finance.info(cuota({ fechaVencimiento: iso(-10) }), []);
  assert.equal(inf.estado, 'Vencida');
  assert.equal(inf.mora, 40);
  assert.equal(inf.totalPagar, 440);
});

test('la mora no pasa del tope: 45 días de atraso cobran S/ 80 (20 % de S/ 400), no S/ 180', () => {
  const inf = finance.info(cuota({ fechaVencimiento: iso(-45) }), []);
  assert.equal(inf.mora, 80);
  assert.equal(inf.totalPagar, 480);
});

test('una cuota que vence hoy o más adelante no genera mora', () => {
  assert.equal(finance.info(cuota({ fechaVencimiento: iso(0) }), []).mora, 0);
  assert.equal(finance.info(cuota({ fechaVencimiento: iso(5) }), []).mora, 0);
});

test('la mora se calcula sobre el SALDO: con un abono aprobado de S/ 200, 10 días dan S/ 20', () => {
  const inf = finance.info(cuota({ fechaVencimiento: iso(-10) }), [pago(200, 'Aprobado')]);
  assert.equal(inf.saldo, 200);
  assert.equal(inf.mora, 20);
});

test('una cuota pagada completa no tiene mora aunque haya vencido', () => {
  const inf = finance.info(cuota({ fechaVencimiento: iso(-30) }), [pago(400, 'Aprobado')]);
  assert.equal(inf.estado, 'Pagada');
  assert.equal(inf.mora, 0);
});

test('una cuota anulada no genera mora', () => {
  const inf = finance.info(cuota({ anulada: true, fechaVencimiento: iso(-30) }), []);
  assert.equal(inf.mora, 0);
});

test('la mora se calcula hasta la fecha de PAGO: pagar hace 5 días de una cuota vencida hace 10 cobra 5 días', () => {
  const inf = finance.info(cuota({ fechaVencimiento: iso(-10) }), []);
  assert.equal(finance.moraA(inf, iso(-5)), 20);   // 5 días × 1 % × 400
  assert.equal(finance.moraA(inf, iso(0)), 40);    // 10 días
  assert.equal(finance.moraA(inf, iso(-10)), 0);   // pagó el día del vencimiento
});

test('los descuentos están desactivados: un descuento guardado se ignora y el tope se calcula sobre el importe completo', () => {
  const inf = finance.info(cuota({ importe: 500, descuento: 100, fechaVencimiento: iso(-60) }), []);
  assert.equal(inf.descuento, 0);
  assert.equal(inf.exigible, 500);
  assert.equal(inf.mora, 100);   // 20 % de S/ 500
});

test('si el pago completo ya fue reportado (en revisión), la mora queda fija y no se puede volver a pagar', () => {
  const inf = finance.info(cuota({ fechaVencimiento: iso(-45) }), [pago(480, 'Pendiente')]);
  assert.equal(inf.moraFija, true);
  assert.equal(inf.mora, 80);
  assert.equal(inf.disponible, 0);
});

test('el monto a pagar de hoy incluye la mora: disponibleA = saldo + mora', () => {
  const inf = finance.info(cuota({ fechaVencimiento: iso(-10) }), []);
  assert.equal(finance.disponibleA(inf, iso(0)), 440);
});
