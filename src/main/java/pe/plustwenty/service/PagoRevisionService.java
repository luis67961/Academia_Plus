package pe.plustwenty.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.plustwenty.model.Auditoria;
import pe.plustwenty.model.Notificacion;
import pe.plustwenty.model.Pago;
import pe.plustwenty.model.Pension;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.AuditoriaRepository;
import pe.plustwenty.repository.NotificacionRepository;
import pe.plustwenty.repository.PagoRepository;
import pe.plustwenty.repository.PensionRepository;
import pe.plustwenty.repository.UsuarioRepository;

/**
 * Revisión de pagos (aprobar/rechazar) en UNA sola operación transaccional:
 * actualiza el pago, emite el recibo, notifica al estudiante y registra la auditoría.
 * Antes el frontend hacía 4-5 llamadas en fila (lento con XHR síncrono + latencia de red).
 */
@Service
public class PagoRevisionService {

    private final PagoRepository pagos;
    private final PensionRepository pensiones;
    private final UsuarioRepository usuarios;
    private final NotificacionRepository notificaciones;
    private final AuditoriaRepository auditorias;
    private final CounterService counters;

    public PagoRevisionService(PagoRepository pagos, PensionRepository pensiones, UsuarioRepository usuarios,
                               NotificacionRepository notificaciones, AuditoriaRepository auditorias,
                               CounterService counters) {
        this.pagos = pagos;
        this.pensiones = pensiones;
        this.usuarios = usuarios;
        this.notificaciones = notificaciones;
        this.auditorias = auditorias;
        this.counters = counters;
    }

    @Transactional
    public Pago aprobar(String pagoId, Usuario admin) {
        Pago p = cargarPendiente(pagoId);
        String recibo = "R-" + String.format("%06d", counters.next("recibo"));
        p.estado = "Aprobado";
        p.revisadoPor = admin.nombre;
        p.fechaRevision = ahora();
        p.reciboNumero = recibo;
        pagos.save(p);

        notificar(p.estudianteId, "¡Pago Aprobado!",
                "Tu abono de " + money(p.monto) + " por \"" + conceptoDe(p)
                        + "\" ha sido verificado con éxito. Recibo interno " + recibo + ".",
                "success", "historial");
        auditar(admin, "Aprobó pago " + recibo + " de " + money(p.monto),
                "Verificación de Pagos", "Op: " + texto(p.numeroOperacion));
        return p;
    }

    @Transactional
    public Pago rechazar(String pagoId, String motivo, Usuario admin) {
        Pago p = cargarPendiente(pagoId);
        p.estado = "Rechazado";
        p.motivoRechazo = motivo;
        p.revisadoPor = admin.nombre;
        p.fechaRevision = ahora();
        pagos.save(p);

        notificar(p.estudianteId, "Pago Observado / Rechazado",
                "Tu reporte de pago de " + money(p.monto) + " fue rechazado por administración: \""
                        + motivo + "\". Por favor, revisa el voucher y vuelve a reportarlo.",
                "danger", "reportar");
        auditar(admin, "Rechazó pago Op. " + texto(p.numeroOperacion),
                "Verificación de Pagos", "Motivo: " + motivo);
        return p;
    }

    private Pago cargarPendiente(String pagoId) {
        Pago p = pagos.findById(pagoId).orElseThrow(() -> new ApiException(404, "Pago no encontrado."));
        if (!"Pendiente".equals(p.estado)) {
            throw new ApiException(409, "Este pago ya fue revisado.");
        }
        return p;
    }

    private String conceptoDe(Pago p) {
        if (p.pensionId == null) {
            return "Pensión";
        }
        Pension pen = pensiones.findById(p.pensionId).orElse(null);
        return pen != null && pen.concepto != null ? pen.concepto : "Pensión";
    }

    /** Crea la notificación para todas las cuentas de estudiante/apoderado vinculadas al expediente. */
    private void notificar(String estudianteId, String titulo, String mensaje, String tipo, String link) {
        if (estudianteId == null) {
            return;
        }
        for (Usuario u : usuarios.findByEstudianteId(estudianteId)) {
            if (!"user".equals(u.rol)) {
                continue;
            }
            Notificacion n = new Notificacion();
            n.id = nuevoId("ntf");
            n.orden = counters.next("orden");
            n.userId = u.id;
            n.titulo = titulo;
            n.mensaje = mensaje;
            n.tipo = tipo;
            n.fecha = ahora();
            n.leida = false;
            n.link = link;
            n.ref = "";
            notificaciones.save(n);
        }
    }

    private void auditar(Usuario admin, String accion, String modulo, String motivo) {
        Auditoria a = new Auditoria();
        a.id = nuevoId("aud");
        a.orden = counters.next("orden");
        a.fecha = ahora();
        a.adminId = admin.id;
        a.admin = admin.nombre;
        a.accion = accion;
        a.modulo = modulo;
        a.motivo = motivo;
        auditorias.save(a);
    }

    private String nuevoId(String prefijo) {
        return prefijo + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private String ahora() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();
    }

    private String money(BigDecimal m) {
        return "S/ " + (m == null ? BigDecimal.ZERO : m).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private String texto(String s) {
        return s == null ? "—" : s;
    }
}
