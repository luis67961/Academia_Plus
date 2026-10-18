(function () {
    'use strict';
    const main = document.querySelector('main');
    if (main) {
        if (!main.id) main.id = 'contenido';
        main.tabIndex = -1;
        const skip = document.createElement('a'); skip.href = '#' + main.id;
        skip.className = 'skip-link'; skip.textContent = 'Saltar al contenido';
        document.body.prepend(skip);
    }
    document.querySelectorAll('form[data-confirm]').forEach(form => {
        form.addEventListener('submit', event => {
            if (!window.confirm(form.dataset.confirm)) event.preventDefault();
        });
    });
    document.querySelectorAll('table').forEach(table => {
        table.setAttribute('role', 'table');
        const headers = Array.from(table.querySelectorAll('thead th'));
        headers.forEach(th => th.scope = 'col');
        table.querySelectorAll('tr').forEach(row => row.setAttribute('role', 'row'));
        table.querySelectorAll('tbody tr').forEach(row => {
            Array.from(row.children).forEach((cell, index) => {
                cell.setAttribute('role', 'cell');
                if (cell.colSpan > 1 || !headers[index]) return;
                const label = document.createElement('span'); label.className = 'cell-label';
                label.setAttribute('aria-hidden', 'true'); label.textContent = headers[index].textContent;
                cell.prepend(label);
            });
        });
        const wrap = table.closest('.table-wrap, .overflow-x-auto');
        if (wrap) { wrap.tabIndex = 0; wrap.setAttribute('role', 'region');
            wrap.setAttribute('aria-label', (table.caption?.textContent || 'Tabla de datos') + '. Puedes desplazarte si es necesario.'); }
    });
    document.querySelectorAll('input, select, textarea').forEach(input => {
        const label = input.closest('label');
        const help = label?.querySelector('small');
        if (help) { if (!help.id) help.id = 'ayuda-' + Math.random().toString(36).slice(2); input.setAttribute('aria-describedby', help.id); }
        if (help?.classList.contains('error') && help.textContent.trim()) input.setAttribute('aria-invalid','true');
    });
    const sidebar = document.getElementById('sidebar');
    const open = document.getElementById('sidebar-open');
    const close = document.getElementById('sidebar-close');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && open && close && overlay) {
        const mobile = window.matchMedia('(max-width: 767px)'); let expanded = false;
        open.setAttribute('aria-controls', 'sidebar');
        function render() {
            sidebar.inert = mobile.matches && !expanded;
            sidebar.classList.toggle('-translate-x-full', !expanded);
            overlay.classList.toggle('hidden', !mobile.matches || !expanded);
            open.setAttribute('aria-expanded', String(expanded));
        }
        function hide() { expanded = false; render(); open.focus(); }
        open.addEventListener('click', () => { expanded = true; render(); close.focus(); });
        close.addEventListener('click', hide); overlay.addEventListener('click', hide);
        mobile.addEventListener('change', () => { expanded = false; render(); });
        document.addEventListener('keydown', event => {
            if (!mobile.matches || !expanded) return;
            if (event.key === 'Escape') { event.preventDefault(); hide(); }
            if (event.key === 'Tab') {
                const items = Array.from(sidebar.querySelectorAll('a, button')).filter(el => el.getClientRects().length);
                const first = items[0], last = items[items.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        }); render();
    }
    document.querySelectorAll('[data-flash-close]').forEach(button => button.addEventListener('click', () => button.closest('[data-flash]').remove()));
    const group = document.getElementById('programaId');
    if (group) { const description=document.createElement('p'); description.className='course-selection-description'; description.setAttribute('aria-live','polite'); group.closest('label').after(description); const update=()=>description.textContent=group.value ? group.selectedOptions[0].textContent : ''; group.addEventListener('change',update); update(); }
    document.querySelectorAll('[data-steps]').forEach(form => {
        const steps = Array.from(form.querySelectorAll('fieldset[data-step]'));
        if (steps.length < 2) return;
        form.noValidate = true; let current = 0;
        const status = document.createElement('p'); status.className = 'step-status'; status.setAttribute('aria-live','polite'); form.prepend(status);
        const actions = document.createElement('div'); actions.className = 'step-actions';
        const back = document.createElement('button'); back.type = 'button'; back.className = 'secondary'; back.textContent = 'Anterior';
        const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Continuar →';
        actions.append(back,next); form.append(actions);
        const submit = form.querySelector('button[type=submit]');
        const valid = step => { const bad = Array.from(step.querySelectorAll('input,select,textarea')).find(el => !el.checkValidity()); if (bad) { bad.reportValidity(); return false; } return true; };
        function show(focus) { steps.forEach((step,i) => step.hidden = i !== current); status.textContent = 'Paso ' + (current+1) + ' de ' + steps.length + ' · ' + steps[current].querySelector('legend').textContent; back.hidden = current === 0; next.hidden = current === steps.length-1; submit.hidden = current !== steps.length-1; if (focus) { const first=steps[current].querySelector('input:not([type=hidden]),select,textarea'); first?.focus(); } }
        next.addEventListener('click', () => { if (valid(steps[current])) { current++; show(true); } });
        back.addEventListener('click', () => { current--; show(true); });
        form.addEventListener('submit', event => { for (let i=0;i<steps.length;i++) { const bad=Array.from(steps[i].querySelectorAll('input,select,textarea')).find(el=>!el.checkValidity()); if (bad) { event.preventDefault(); current=i; show(false); bad.reportValidity(); return; } } });
        show(false);
    });
})();
