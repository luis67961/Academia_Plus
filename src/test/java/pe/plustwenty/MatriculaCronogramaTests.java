package pe.plustwenty;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import pe.plustwenty.model.Ciclo;
import pe.plustwenty.model.Estudiante;
import pe.plustwenty.model.Matricula;
import pe.plustwenty.model.Pension;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.*;
import pe.plustwenty.service.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Evidencia 3 · Funcionalidad diferenciadora: la matrícula genera sola el cronograma de pensiones. */
class MatriculaCronogramaTests {

    private MatriculaRepository matriculas;
    private PensionRepository pensiones;
    private CicloRepository ciclos;
    private EstudianteRepository estudiantes;
    private CounterService counters;
    private EventoService eventos;
    private MatriculaService servicio;
    private Usuario admin;
    private Estudiante alumno;

    @BeforeEach
    void preparar() {
        matriculas = mock(MatriculaRepository.class);
        pensiones = mock(PensionRepository.class);
        ciclos = mock(CicloRepository.class);
        estudiantes = mock(EstudianteRepository.class);
        counters = mock(CounterService.class);
        eventos = mock(EventoService.class);
        when(counters.next("matricula")).thenReturn(1L);
        when(eventos.ahora()).thenReturn("2026-11-01T10:00:00.000Z");

        Ciclo ciclo = new Ciclo();
        ciclo.id = "cic1";
        ciclo.nombre = "Ordinario 2026-I";
        ciclo.fechaInicio = "2026-03-02";
        ciclo.matricula = new BigDecimal("150");
        ciclo.pension = new BigDecimal("400");
        ciclo.cuotas = 4;
        when(ciclos.findById("cic1")).thenReturn(Optional.of(ciclo));

        alumno = new Estudiante();
        alumno.id = "est_a";
        alumno.dni = "12345678";
        when(estudiantes.findById("est_a")).thenReturn(Optional.of(alumno));

        admin = new Usuario();
        admin.id = "usr_admin";
        admin.nombre = "Administrador";
        admin.rol = "admin";

        servicio = new MatriculaService(matriculas, pensiones, ciclos, estudiantes, counters, eventos);
    }

    private List<Pension> cuotasGeneradas() {
        ArgumentCaptor<Pension> c = ArgumentCaptor.forClass(Pension.class);
        verify(pensiones, atLeastOnce()).save(c.capture());
        return c.getAllValues();
    }

    @Test
    void matricularGeneraElCargoDeMatriculaMasLasPensionesMensualesDelDia15() {
        Matricula m = servicio.registrar(
                new MatriculaService.NuevaMatricula("est_a", "cic1", "prog1", "2026-02-20", null), admin);

        assertEquals("MAT-2026-0001", m.codigo);
        assertEquals("Activa", m.estado);

        List<Pension> cuotas = cuotasGeneradas();
        assertEquals(5, cuotas.size(), "1 matrícula + 4 pensiones");

        Pension cargo = cuotas.get(0);
        assertEquals("Matrícula", cargo.tipo);
        assertEquals(new BigDecimal("150.00"), cargo.importe);
        assertEquals("2026-03-02", cargo.fechaVencimiento, "matrícula anticipada: vence al inicio del ciclo");

        String[] vencimientos = {"2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15"};
        for (int i = 0; i < 4; i++) {
            Pension p = cuotas.get(i + 1);
            assertEquals("Pensión", p.tipo);
            assertEquals(i + 1, p.numeroCuota);
            assertEquals(new BigDecimal("400.00"), p.importe);
            assertEquals(vencimientos[i], p.fechaVencimiento);
            assertEquals(m.id, p.matriculaId, "toda cuota pertenece a la matrícula creada");
            assertEquals("est_a", p.estudianteId);
            assertEquals(BigDecimal.ZERO, p.descuento);
            assertFalse(p.anulada);
        }
        assertEquals("Pensión 1/4 · Marzo", cuotas.get(1).concepto);
    }

    @Test
    void unaMatriculaPosteriorAlInicioDelCicloVence3DiasDespues() {
        servicio.registrar(new MatriculaService.NuevaMatricula("est_a", "cic1", "prog1", "2026-03-10", null), admin);
        assertEquals("2026-03-13", cuotasGeneradas().get(0).fechaVencimiento);
    }

    @Test
    void matricularActualizaElCicloDelEstudianteYLoAvisa() {
        servicio.registrar(new MatriculaService.NuevaMatricula("est_a", "cic1", "prog1", "2026-02-20", null), admin);

        assertEquals("cic1", alumno.cicloId);
        assertEquals("prog1", alumno.programaId);
        verify(estudiantes).save(alumno);
        verify(eventos).notificarEstudiante(eq("est_a"), contains("Matrícula"), anyString(), eq("success"), anyString());
    }

    @Test
    void faltanDatosDa400() {
        ApiException ex = assertThrows(ApiException.class, () -> servicio.registrar(
                new MatriculaService.NuevaMatricula("est_a", null, "prog1", "2026-02-20", null), admin));
        assertEquals(400, ex.getStatus());
        verify(matriculas, never()).save(any());
    }

    @Test
    void unCicloOUnEstudianteInexistenteDa404SinGuardarNada() {
        ApiException sinCiclo = assertThrows(ApiException.class, () -> servicio.registrar(
                new MatriculaService.NuevaMatricula("est_a", "no_existe", "prog1", "2026-02-20", null), admin));
        assertEquals(404, sinCiclo.getStatus());

        ApiException sinEstudiante = assertThrows(ApiException.class, () -> servicio.registrar(
                new MatriculaService.NuevaMatricula("no_existe", "cic1", "prog1", "2026-02-20", null), admin));
        assertEquals(404, sinEstudiante.getStatus());

        verify(matriculas, never()).save(any());
        verify(pensiones, never()).save(any());
    }
}
