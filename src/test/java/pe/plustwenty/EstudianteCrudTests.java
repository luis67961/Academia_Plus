package pe.plustwenty;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import pe.plustwenty.model.Estudiante;
import pe.plustwenty.model.Usuario;
import pe.plustwenty.repository.*;
import pe.plustwenty.service.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Evidencia 3 · CRUD de la entidad núcleo (Estudiante).
 *   Create  -> EstudianteService.registrar
 *   Read    -> DataService.bootstrap (el admin ve todos; el estudiante solo su ficha)
 *   Update  -> DataService.actualizar (con permisos por rol)
 *   Delete  -> baja lógica (activo = false): el sistema nunca borra estudiantes con historial.
 */
class EstudianteCrudTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    private EstudianteRepository estudiantes;
    private UsuarioRepository usuarios;
    private CounterService counters;
    private EventoService eventos;
    private EstudianteService servicio;
    private DataService datos;
    private Usuario admin;

    @BeforeEach
    void preparar() {
        estudiantes = mock(EstudianteRepository.class);
        usuarios = mock(UsuarioRepository.class);
        counters = mock(CounterService.class);
        eventos = mock(EventoService.class);
        when(eventos.nuevoId(anyString())).thenAnswer(i -> i.getArgument(0) + "_abc123");
        when(eventos.ahora()).thenReturn("2026-11-01T10:00:00.000Z");
        when(counters.next("estudiante")).thenReturn(7L);
        when(estudiantes.save(any())).thenAnswer(i -> i.getArgument(0));

        servicio = new EstudianteService(estudiantes, usuarios, counters, encoder, eventos);
        datos = new DataService(mapper, counters, encoder,
                mock(ProgramaRepository.class), mock(CicloRepository.class), estudiantes, usuarios,
                mock(MatriculaRepository.class), mock(PensionRepository.class), mock(PagoRepository.class),
                mock(NotificacionRepository.class), mock(AuditoriaRepository.class), mock(ComprobantePagoRepository.class));

        admin = new Usuario();
        admin.id = "usr_admin";
        admin.nombre = "Administrador";
        admin.rol = "admin";
    }

    private Estudiante ficha(String dni) {
        Estudiante e = new Estudiante();
        e.dni = dni;
        e.nombres = "Ana";
        e.apellidos = "Quispe";
        e.telefono = "987654321";
        e.email = "ana@example.com";
        return e;
    }

    private Estudiante guardado(String id, String dni) {
        Estudiante e = ficha(dni);
        e.id = id;
        e.activo = true;
        return e;
    }

    private Usuario cuentaDeEstudiante(String estudianteId) {
        Usuario u = new Usuario();
        u.id = "usr_" + estudianteId;
        u.rol = "user";
        u.estudianteId = estudianteId;
        return u;
    }

    // ------------------------------------------------------------------ CREATE

    @Test
    void crearGuardaLaFichaYSuCuentaDeAcceso() {
        Estudiante e = servicio.registrar(ficha(" 12345678 "), admin);

        assertEquals("12345678", e.dni, "el DNI se guarda sin espacios");
        assertEquals("PT-2026-007", e.codigo);
        assertTrue(e.activo);
        verify(estudiantes).save(e);

        ArgumentCaptor<Usuario> cuenta = ArgumentCaptor.forClass(Usuario.class);
        verify(usuarios).save(cuenta.capture());
        Usuario u = cuenta.getValue();
        assertEquals("12345678", u.username, "el usuario inicial es el DNI");
        assertEquals("user", u.rol);
        assertEquals(e.id, u.estudianteId, "la cuenta queda vinculada a la ficha");
        assertNotEquals("12345678", u.password, "la contraseña nunca se guarda en claro");
        assertTrue(encoder.matches("12345678", u.password));
        verify(eventos).auditar(eq(admin), contains("12345678"), anyString(), anyString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"1234567", "123456789", "1234567a", "", "   "})
    void crearRechazaUnDniQueNoTiene8Digitos(String dni) {
        ApiException ex = assertThrows(ApiException.class, () -> servicio.registrar(ficha(dni), admin));
        assertEquals(400, ex.getStatus());
        verify(estudiantes, never()).save(any());
        verify(usuarios, never()).save(any());
    }

    @Test
    void crearRechazaUnDniYaRegistrado() {
        when(estudiantes.existsByDni("12345678")).thenReturn(true);
        ApiException ex = assertThrows(ApiException.class, () -> servicio.registrar(ficha("12345678"), admin));
        assertEquals(409, ex.getStatus());
        verify(estudiantes, never()).save(any());
        verify(usuarios, never()).save(any());
    }

    @Test
    void crearRechazaUnTelefonoQueNoTiene9Digitos() {
        Estudiante e = ficha("12345678");
        e.telefono = "12345";
        ApiException ex = assertThrows(ApiException.class, () -> servicio.registrar(e, admin));
        assertEquals(400, ex.getStatus());
        verify(estudiantes, never()).save(any());
    }

    @Test
    void crearRechazaUnTelefonoQueNoEmpiezaConNueve() {
        Estudiante e = ficha("12345678");
        e.telefono = "812345678";            // 9 dígitos, pero los celulares peruanos empiezan con 9
        ApiException ex = assertThrows(ApiException.class, () -> servicio.registrar(e, admin));
        assertEquals(400, ex.getStatus());
        verify(estudiantes, never()).save(any());
    }

    @Test
    void crearRechazaUnCorreoInvalido() {
        Estudiante e = ficha("12345678");
        e.email = "ana@sinpunto";
        ApiException ex = assertThrows(ApiException.class, () -> servicio.registrar(e, admin));
        assertEquals(400, ex.getStatus());
        verify(estudiantes, never()).save(any());
    }

    @Test
    void crearRechazaUnaFechaDeNacimientoFutura() {
        Estudiante e = ficha("12345678");
        e.fechaNacimiento = java.time.LocalDate.now().plusDays(1).toString();
        ApiException ex = assertThrows(ApiException.class, () -> servicio.registrar(e, admin));
        assertEquals(400, ex.getStatus());
        verify(estudiantes, never()).save(any());
    }

    // ------------------------------------------------------------------ READ

    @SuppressWarnings("unchecked")
    private List<Object> estudiantesDe(Map<String, Object> respuesta) {
        return (List<Object>) ((Map<String, Object>) respuesta.get("data")).get("estudiantes");
    }

    @Test
    void leerComoAdminDevuelveTodosLosEstudiantes() {
        when(estudiantes.findAll(any(Sort.class)))
                .thenReturn(List.of(guardado("est_a", "11111111"), guardado("est_b", "22222222")));
        assertEquals(2, estudiantesDe(datos.bootstrap(admin)).size());
    }

    @Test
    void leerComoEstudianteDevuelveSoloSuPropiaFicha() {
        when(estudiantes.findById("est_a")).thenReturn(Optional.of(guardado("est_a", "11111111")));
        List<Object> lista = estudiantesDe(datos.bootstrap(cuentaDeEstudiante("est_a")));
        assertEquals(1, lista.size());
        assertEquals("est_a", ((Estudiante) lista.get(0)).id);
        verify(estudiantes, never()).findAll(any(Sort.class));
    }

    // ------------------------------------------------------------------ UPDATE

    @Test
    void actualizarComoAdminCambiaElTelefono() {
        when(estudiantes.findById("est_a")).thenReturn(Optional.of(guardado("est_a", "11111111")));
        ObjectNode cambios = mapper.createObjectNode().put("telefono", "912345678");

        Estudiante r = (Estudiante) datos.actualizar("estudiantes", "est_a", cambios, admin);

        assertEquals("912345678", r.telefono);
        verify(estudiantes).save(r);
    }

    @Test
    void actualizarRechazaUnTelefonoInvalido() {
        when(estudiantes.findById("est_a")).thenReturn(Optional.of(guardado("est_a", "11111111")));
        ObjectNode cambios = mapper.createObjectNode().put("telefono", "12345");
        ApiException ex = assertThrows(ApiException.class, () -> datos.actualizar("estudiantes", "est_a", cambios, admin));
        assertEquals(400, ex.getStatus());
        verify(estudiantes, never()).save(any());
    }

    @Test
    void actualizarUnRegistroInexistenteDa404() {
        when(estudiantes.findById("no_existe")).thenReturn(Optional.empty());
        ObjectNode cambios = mapper.createObjectNode().put("telefono", "912345678");
        ApiException ex = assertThrows(ApiException.class, () -> datos.actualizar("estudiantes", "no_existe", cambios, admin));
        assertEquals(404, ex.getStatus());
    }

    @Test
    void elEstudianteSoloPuedeEditarSuContactoNoSuDniNiSusNombres() {
        when(estudiantes.findById("est_a")).thenReturn(Optional.of(guardado("est_a", "11111111")));
        ObjectNode cambios = mapper.createObjectNode()
                .put("telefono", "911111112").put("dni", "99999999").put("nombres", "Intruso");

        Estudiante r = (Estudiante) datos.actualizar("estudiantes", "est_a", cambios, cuentaDeEstudiante("est_a"));

        assertEquals("911111112", r.telefono, "su teléfono sí se actualiza");
        assertEquals("11111111", r.dni, "el DNI no se puede cambiar desde el portal");
        assertEquals("Ana", r.nombres, "los nombres no se pueden cambiar desde el portal");
    }

    @Test
    void elEstudianteNoPuedeEditarLaFichaDeOtro() {
        when(estudiantes.findById("est_a")).thenReturn(Optional.of(guardado("est_a", "11111111")));
        ObjectNode cambios = mapper.createObjectNode().put("telefono", "911111112");
        ApiException ex = assertThrows(ApiException.class,
                () -> datos.actualizar("estudiantes", "est_a", cambios, cuentaDeEstudiante("est_b")));
        assertEquals(403, ex.getStatus());
        verify(estudiantes, never()).save(any());
    }

    // ------------------------------------------------------------------ DELETE (baja lógica)

    @Test
    void darDeBajaMarcaActivoEnFalsoYConservaElRegistro() {
        when(estudiantes.findById("est_a")).thenReturn(Optional.of(guardado("est_a", "11111111")));
        ObjectNode cambios = mapper.createObjectNode().put("activo", false);

        Estudiante r = (Estudiante) datos.actualizar("estudiantes", "est_a", cambios, admin);

        assertFalse(r.activo);
        verify(estudiantes).save(r);
        verify(estudiantes, never()).deleteById(any());
        verify(estudiantes, never()).delete(any());
    }
}
