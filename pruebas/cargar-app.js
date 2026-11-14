// Carga js/app.js (script de navegador) dentro de un "navegador falso" mínimo
// para poder probar sus reglas financieras con node:test, sin instalar nada.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function localizarApp() {
  const raiz = path.resolve(__dirname, '..');
  const candidatos = [
    process.env.APP_JS,
    path.join(raiz, 'frontend/PLUSTWENTY/js/app.js'),
    path.join(raiz, 'src/main/resources/static/PLUSTWENTY/js/app.js'),
    path.join(raiz, 'PLUSTWENTY/js/app.js')
  ].filter(Boolean);
  const ruta = candidatos.find(p => fs.existsSync(p));
  if (!ruta) throw new Error('No se encontró js/app.js. Define la variable APP_JS con su ruta.');
  return ruta;
}

function cargarPT() {
  const noop = () => {};
  const elemento = () => new Proxy(function () {}, {
    get: (_, k) => (k === 'classList' ? { add: noop, remove: noop, toggle: noop, contains: () => false }
      : k === 'style' || k === 'dataset' ? {} : elemento()),
    apply: () => elemento()
  });
  const store = {};
  const ventana = {
    addEventListener: noop, removeEventListener: noop,
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    location: { hash: '', href: 'http://localhost/', replace: noop, pathname: '/' },
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: f => setTimeout(f, 0)
  };
  ventana.window = ventana;
  const documento = {
    // Si existe 'login-form', app.js no intenta descargar datos del servidor.
    getElementById: id => (id === 'login-form' ? elemento() : null),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, body: elemento(), documentElement: elemento(),
    createElement: elemento, readyState: 'complete'
  };
  ventana.document = documento;
  const sandbox = Object.assign(ventana, {
    document: documento, console, setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Intl, Promise, Set, Map, Array, Object, String, Number, RegExp, Error,
    MutationObserver: class { observe() {} disconnect() {} },
    XMLHttpRequest: class { open() {} send() {} setRequestHeader() {} },
    FormData: class {}, URL, Blob: class {}, navigator: { userAgent: 'node' }
  });
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(localizarApp(), 'utf8'), sandbox, { filename: 'app.js' });
  if (!sandbox.PT) throw new Error('app.js no expuso window.PT');
  return sandbox.PT;
}

/** Fecha ISO (AAAA-MM-DD) desplazada n días respecto de hoy: iso(-10) = hace 10 días. */
function iso(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

module.exports = { cargarPT, localizarApp, iso };
