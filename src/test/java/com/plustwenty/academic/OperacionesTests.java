package com.plustwenty.academic;
import com.plustwenty.academic.model.*;
import com.plustwenty.academic.repository.*;
import com.plustwenty.academic.service.*;
import com.plustwenty.academic.controller.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.support.RedirectAttributesModelMap;
import java.time.LocalDate;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:operaciones") @Transactional
class OperacionesTests {
 @Autowired ProgramaRepository programas;@Autowired MatriculaRepository matriculas;@Autowired SolicitudRepository solicitudes;
 @Autowired InscripcionService inscripciones;@Autowired ProgramaService oferta;@Autowired AsistenciaRepository asistencias;
 @Autowired AsistenciaController asistencia;@Autowired CuentaRepository cuentas;@Autowired EstudianteController estudiantes;
 private Programa grupo(){var p=new Programa();p.setNombre("Robótica");p.setGrupo("Grupo de prueba");p.setCursos("Programación y sensores");p.setHorario("Sábados 9:00");p.setCupo(1);return programas.save(p);}
 private InscripcionForm form(Programa p,String dni){var f=new InscripcionForm();f.setProgramaId(p.getId());f.setAlumno("Alumno de prueba");f.setDni(dni);f.setContacto("Apoderado");f.setTelefono("999888777");f.setTurno("Mañana");f.setAceptaContacto(true);return f;}
 @Test void grupoConfigurableRespetaCupoYNoReconfirma(){var p=grupo();inscripciones.solicitar(form(p,"93000001"),"estudiante");var s=solicitudes.findAllByOrderByFechaDescIdDesc().getFirst();inscripciones.confirmar(s.getId());assertEquals(0,oferta.disponibles(p));assertThrows(IllegalArgumentException.class,()->inscripciones.solicitar(form(p,"93000002"),"estudiante"));assertThrows(IllegalArgumentException.class,()->inscripciones.confirmar(s.getId()));assertEquals(1,matriculas.countByProgramaIdAndEstado(p.getId(),"ACTIVA"));}
 @Test void solicitudCorregidaConservaCierreYMotivo(){var p=grupo();inscripciones.solicitar(form(p,"93000003"),"estudiante");var s=solicitudes.findAllByOrderByFechaDescIdDesc().getFirst();var f=form(p,"93000003");f.setAlumno("Nombre corregido");inscripciones.editar(s.getId(),f);inscripciones.cerrar(s.getId(),Solicitud.Estado.RECHAZADA,"No hay horario compatible","admin");assertEquals("Nombre corregido",s.getAlumno());assertEquals("No hay horario compatible",s.getMotivo());assertEquals("admin",s.getRevisadaPor());assertThrows(IllegalArgumentException.class,()->inscripciones.confirmar(s.getId()));}
 @Test void asistenciaSeActualizaSinDuplicarYRechazaFuturo(){var p=grupo();var m=new Matricula("Alumno asistencia","93000004",p.getNombre(),"Mañana",LocalDate.now(),"ACTIVA");m.setPrograma(p);matriculas.save(m);var r=new RedirectAttributesModelMap();asistencia.guardar(p.getId(),LocalDate.now(),Map.of("estado_"+m.getId(),"PRESENTE"),()->"admin",r);asistencia.guardar(p.getId(),LocalDate.now(),Map.of("estado_"+m.getId(),"TARDANZA"),()->"admin",r);assertEquals(1,asistencias.findByMatriculaProgramaIdAndFecha(p.getId(),LocalDate.now()).size());assertEquals(Asistencia.Estado.TARDANZA,asistencias.findByMatriculaIdAndFecha(m.getId(),LocalDate.now()).orElseThrow().getEstado());asistencia.guardar(p.getId(),LocalDate.now().plusDays(1),Map.of("estado_"+m.getId(),"PRESENTE"),()->"admin",r);assertTrue(asistencias.findByMatriculaIdAndFecha(m.getId(),LocalDate.now().plusDays(1)).isEmpty());}
 @Test void vincularMatriculaExigeVerificacionYNoTransfiereTitularidad(){var p=grupo();var m=new Matricula("Alumno anterior","93000005",p.getNombre(),"Mañana",LocalDate.now(),"ACTIVA");m.setPrograma(p);matriculas.save(m);var estudiante=cuentas.findByUsuario("estudiante").orElseThrow();var padre=cuentas.findByUsuario("padre").orElseThrow();var r=new RedirectAttributesModelMap();estudiantes.vincular(m.getDni(),m.getId(),estudiante.getId(),false,r);assertNull(m.getCuenta());estudiantes.vincular(m.getDni(),m.getId(),estudiante.getId(),true,r);assertEquals(estudiante.getId(),m.getCuenta().getId());estudiantes.vincular(m.getDni(),m.getId(),padre.getId(),true,r);assertEquals(estudiante.getId(),m.getCuenta().getId());}
}
