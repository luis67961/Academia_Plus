package pe.plustwenty;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import pe.plustwenty.model.Pago;
import pe.plustwenty.model.Pension;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.*;
import pe.plustwenty.service.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Evidencia 3 · Funcionalidad diferenciadora: control de pagos de pensiones.
 *  (1) Reglas al REPORTAR un pago desde el portal (DataService.insertar).
 *  (2) Revisión del administrador: aprobar / rechazar / cobrar en caja (PagoRevisionService).
 */
class PagosReglasTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    private PagoRepository pagos;
    private PensionRepository pensiones;
    private EstudianteRepository estudiantes;
    private CounterService counters;
    private EventoService eventos;
    private DataService datos;
    private PagoRevisionService revision;
    private Usuario admin;
    private Usuario alumno;

    @BeforeEach
    void preparar() {
        pagos = mock(PagoRepository.class);
        pensiones = mock(PensionRepository.class);
        estudiantes = mock(EstudianteRepository.class);
        counters = mock(CounterService.class);
        eventos = mock(EventoService.class);
        when(eventos.nuevoId(anyString())).thenAnswer(i -> i.getArgument(0) + "_abc123");
        when(eventos.ahora()).thenReturn("2026-11-01T10:00:00.000Z");
        when(counters.next("recibo")).thenReturn(5L);
        when(counters.next("operacion_caja")).thenReturn(3L);

        datos = new DataService(mapper, counters, encoder,
                mock(ProgramaRepository.class), mock(CicloRepository.class), estudiantes,
                mock(UsuarioRepository.class), mock(MatriculaRepository.class), pensiones, pagos,
                mock(NotificacionRepository.class), mock(AuditoriaRepository.class), mock(ComprobantePagoRepository.class));
        revision = new PagoRevisionService(pagos, pensiones, estudiantes, counters, eventos);

        admin = new Usuario();
        admin.id = "usr_admin";
        admin.nombre = "Administrador";
        admin.rol = "admin";
        alumno = new Usuario();
        alumno.id = "usr_a";
        alumno.rol = "user";
        alumno.estudianteId = "est_a";

        Pension cuotaDeA = new Pension();
        cuotaDeA.id = "pen_a";
        cuotaDeA.estudianteId = "est_a";
        cuotaDeA.concepto = "Pensión 1/4 · Marzo";
        when(pensiones.findById("pen_a")).thenReturn(Optional.of(cuotaDeA));
        Pension cuotaDeB = new Pension();
        cuotaDeB.id = "pen_b";
        cuotaDeB.estudianteId = "est_b";
        when(pensiones.findById("pen_b")).thenReturn(Optional.of(cuotaDeB));
    }

    private ObjectNode reporte(String pensionId, double monto, String metodo, String operacion) {
        return mapper.createObjectNode().put("pensionId", pensionId).put("monto", monto)
                .put("metodo", metodo).put("numeroOperacion", operacion);
    }

    private Pago pendiente(String id) {
        Pago p = new Pago();
        p.id = id;
        p.pensionId = "pen_a";
        p.estudianteId = "est_a";
        p.monto = new BigDecimal("480.00");
        p.metodo = "Yape";
        p.numeroOperacion = "123456";
        p.estado = "Pendiente";
        return p;
    }

    // ------------------------------------------------------------------ (1) reportar un pago

    @Test
    void unPagoReportadoPorElEstudianteSiempreQuedaPendienteYSinRecibo() {
        // El cliente intenta "colarse" como si ya estuviera aprobado y registrado por el admin.
        ObjectNode cuerpo = reporte("pen_a", 480, "Yape", "123456")
                .put("estado", "Aprobado").put("reciboNumero", "R-000001").put("registradoPor", "admin");

        datos.insertar("pagos", cuerpo, alumno);

        ArgumentCaptor<Pago> guardado = ArgumentCaptor.forClass(Pago.class);
        verify(pagos).save(guardado.capture());
        Pago p = guardado.getValue();
        assertEquals("Pendiente", p.estado);
        assertEquals("usuario", p.registradoPor);
        assertNull(p.reciboNumero);
        assertEquals("est_a", p.estudianteId);
        assertEquals(0, new BigDecimal("480").compareTo(p.monto));
    }

    @ParameterizedTest
    @ValueSource(doubles = {0, -50})
    void noSeAceptaUnMontoCeroONegativo(double monto) {
        ApiException ex = assertThrows(ApiException.class,
                () -> datos.insertar("pagos", reporte("pen_a", monto, "Yape", "123456"), alumno));
        assertEquals(400, ex.getStatus());
        verify(pagos, never()).save(any());
    }

    @Test
    void noSePuedePagarLaCuotaDeOtroEstudiante() {
        ApiException ex = assertThrows(ApiException.class,
                () -> datos.insertar("pagos", reporte("pen_b", 400, "Yape", "123456"), alumno));
        assertEquals(403, ex.getStatus());
        verify(pagos, never()).save(any());
    }

    @Test
    void elEstudianteSoloPuedeReportarConYapeOPlin() {
        ApiException ex = assertThrows(ApiException.class,
                () -> datos.insertar("pagos", reporte("pen_a", 400, "Efectivo", "CAJA-00001"), alumno));
        assertEquals(400, ex.getStatus());
        verify(pagos, never()).save(any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"12345", "1234567", "12345a", ""})
    void elNumeroDeOperacionDebeTenerExactamente6Digitos(String operacion) {
        ApiException ex = assertThrows(ApiException.class,
                () -> datos.insertar("pagos", reporte("pen_a", 400, "Plin", operacion), alumno));
        assertEquals(400, ex.getStatus());
        verify(pagos, never()).save(any());
    }

    // ------------------------------------------------------------------ (2) revisión del administrador

    @Test
    void aprobarUnPagoPendienteGeneraReciboYNotificaAlEstudiante() {
        Pago p = pendiente("pag_1");
        when(pagos.findById("pag_1")).thenReturn(Optional.of(p));

        Pago r = revision.aprobar("pag_1", admin);

        assertEquals("Aprobado", r.estado);
        assertEquals("R-000005", r.reciboNumero);
        assertEquals("Administrador", r.revisadoPor);
        verify(pagos).save(p);
        verify(eventos).notificarEstudiante(eq("est_a"), contains("Aprobado"), contains("S/ 480.00"), eq("success"), anyString());
    }

    @Test
    void unPagoYaRevisadoNoSePuedeAprobarDeNuevo() {
        Pago p = pendiente("pag_2");
        p.estado = "Aprobado";
        when(pagos.findById("pag_2")).thenReturn(Optional.of(p));

        ApiException ex = assertThrows(ApiException.class, () -> revision.aprobar("pag_2", admin));

        assertEquals(409, ex.getStatus());
        verify(pagos, never()).save(any());
        verify(counters, never()).next("recibo");
    }

    @Test
    void rechazarGuardaElMotivoYNoGeneraRecibo() {
        Pago p = pendiente("pag_3");
        when(pagos.findById("pag_3")).thenReturn(Optional.of(p));

        Pago r = revision.rechazar("pag_3", "El monto del voucher no coincide", admin);

        assertEquals("Rechazado", r.estado);
        assertEquals("El monto del voucher no coincide", r.motivoRechazo);
        assertNull(r.reciboNumero);
        verify(eventos).notificarEstudiante(eq("est_a"), contains("Rechazado"), contains("no coincide"), eq("danger"), anyString());
    }

    @Test
    void aprobarUnPagoInexistenteDa404() {
        when(pagos.findById("pag_x")).thenReturn(Optional.empty());
        assertEquals(404, assertThrows(ApiException.class, () -> revision.aprobar("pag_x", admin)).getStatus());
    }

    @Test
    void elCobroEnCajaQuedaAprobadoAlInstanteConOperacionYRecibo() {
        Pago r = revision.registrarEnCaja(
                new PagoRevisionService.PagoCaja("est_a", "pen_a", new BigDecimal("400.00"), "2026-11-01"), admin);

        assertEquals("Efectivo", r.metodo);
        assertEquals("Aprobado", r.estado);
        assertEquals("CAJA-00003", r.numeroOperacion);
        assertEquals("R-000005", r.reciboNumero);
        verify(pagos).save(r);
    }

    @Test
    void elCobroEnCajaRechazaMontoCeroYCuotasDeOtroEstudiante() {
        assertEquals(400, assertThrows(ApiException.class, () -> revision.registrarEnCaja(
                new PagoRevisionService.PagoCaja("est_a", "pen_a", BigDecimal.ZERO, "2026-11-01"), admin)).getStatus());
        assertEquals(400, assertThrows(ApiException.class, () -> revision.registrarEnCaja(
                new PagoRevisionService.PagoCaja("est_a", "pen_b", new BigDecimal("100"), "2026-11-01"), admin)).getStatus());
        verify(pagos, never()).save(any());
    }
}
