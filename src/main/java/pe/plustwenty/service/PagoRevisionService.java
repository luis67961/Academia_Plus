package pe.plustwenty.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.plustwenty.model.Pago;
import pe.plustwenty.model.Pension;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.PagoRepository;
import pe.plustwenty.repository.PensionRepository;

/**
 * Revisión de pagos (aprobar/rechazar) en UNA sola operación transaccional:
 * actualiza el pago, emite el recibo, notifica al estudiante y registra la auditoría.
 * Antes el frontend hacía 4-5 llamadas en fila (lento con XHR síncrono + latencia de red).
 */
@Service
public class PagoRevisionService {

    private final PagoRepository pagos;
    private final PensionRepository pensiones;
    private final CounterService counters;
    private final EventoService eventos;

    public PagoRevisionService(PagoRepository pagos, PensionRepository pensiones,
                               CounterService counters, EventoService eventos) {
        this.pagos = pagos;
        this.pensiones = pensiones;
        this.counters = counters;
        this.eventos = eventos;
    }

    @Transactional
    public Pago aprobar(String pagoId, Usuario admin) {
        Pago p = cargarPendiente(pagoId);
        String recibo = "R-" + String.format("%06d", counters.next("recibo"));
        p.estado = "Aprobado";
        p.revisadoPor = admin.nombre;
        p.fechaRevision = eventos.ahora();
        p.reciboNumero = recibo;
        pagos.save(p);

        eventos.notificarEstudiante(p.estudianteId, "¡Pago Aprobado!",
                "Tu abono de " + money(p.monto) + " por \"" + conceptoDe(p)
                        + "\" ha sido verificado con éxito. Recibo interno " + recibo + ".",
                "success", "historial");
        eventos.auditar(admin, "Aprobó pago " + recibo + " de " + money(p.monto),
                "Verificación de Pagos", "Op: " + texto(p.numeroOperacion));
        return p;
    }

    @Transactional
    public Pago rechazar(String pagoId, String motivo, Usuario admin) {
        Pago p = cargarPendiente(pagoId);
        p.estado = "Rechazado";
        p.motivoRechazo = motivo;
        p.revisadoPor = admin.nombre;
        p.fechaRevision = eventos.ahora();
        pagos.save(p);

        eventos.notificarEstudiante(p.estudianteId, "Pago Observado / Rechazado",
                "Tu reporte de pago de " + money(p.monto) + " fue rechazado por administración: \""
                        + motivo + "\". Por favor, revisa el voucher y vuelve a reportarlo.",
                "danger", "reportar");
        eventos.auditar(admin, "Rechazó pago Op. " + texto(p.numeroOperacion),
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

    private String money(BigDecimal m) {
        return "S/ " + (m == null ? BigDecimal.ZERO : m).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private String texto(String s) {
        return s == null ? "—" : s;
    }
}
