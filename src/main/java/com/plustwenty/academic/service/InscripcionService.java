package com.plustwenty.academic.service;

import com.plustwenty.academic.controller.InscripcionForm;
import com.plustwenty.academic.model.*;
import com.plustwenty.academic.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;

@Service
public class InscripcionService {
    private final SolicitudRepository solicitudes;
    private final ProgramaRepository programas;
    private final MatriculaRepository matriculas;
    private final CobranzaService cobranza;
    private final CuentaRepository cuentas;
    private final org.springframework.security.crypto.password.PasswordEncoder encoder;
    public InscripcionService(SolicitudRepository s, ProgramaRepository p, MatriculaRepository m, CobranzaService c,
                              CuentaRepository cuentas, org.springframework.security.crypto.password.PasswordEncoder encoder) {
        solicitudes=s; programas=p; matriculas=m; cobranza=c; this.cuentas=cuentas; this.encoder=encoder;
    }
    @Transactional
    public void solicitar(InscripcionForm form, String usuarioActual) {
        var programa=programas.findById(form.getProgramaId())
                .orElseThrow(()->new IllegalArgumentException("El curso seleccionado no está disponible."));
        if(!programa.isInscripcionesAbiertas()||matriculas.countByProgramaIdAndEstado(programa.getId(),Matricula.ESTADO_ACTIVA)>=programa.getCupo())
            throw new IllegalArgumentException("El grupo no tiene inscripciones disponibles. Elige otro grupo.");
        if(solicitudes.existsByDniAndProgramaIdAndEstado(form.getDni(), programa.getId(), Solicitud.Estado.PENDIENTE))
            throw new IllegalArgumentException("Ya hay una solicitud pendiente para este DNI y grupo. Comunícate con administración para consultar su estado.");
        if(matriculas.existsByDniAndProgramaIdAndIdNot(form.getDni(), programa.getId(), -1L))
            throw new IllegalArgumentException("Este DNI ya tiene una matrícula en el grupo elegido. Comunícate con administración.");
        var s=new Solicitud();
        s.setAlumno(form.getAlumno().trim()); s.setDni(form.getDni());
        s.setContacto(form.getContacto().trim()); s.setTelefono(form.getTelefono().trim());
        s.setTurno(form.getTurno()); s.setPrograma(programa); s.setFecha(LocalDateTime.now());
        Cuenta cuenta;
        if(usuarioActual != null) {
            cuenta=cuentas.findByUsuario(usuarioActual).orElseThrow(()->new IllegalArgumentException("Inicia sesión de nuevo."));
            if(!"ESTUDIANTE".equals(cuenta.getRol()) && !"PADRE".equals(cuenta.getRol()))
                throw new IllegalArgumentException("Para inscribirte usa una cuenta de estudiante o cierra la sesión de administración.");
        } else {
            var usuario=form.getUsuario()==null ? "" : form.getUsuario().trim().toLowerCase(java.util.Locale.ROOT);
            if(!usuario.matches("[a-z0-9][a-z0-9._-]{3,39}"))
                throw new IllegalArgumentException("El usuario debe tener entre 4 y 40 caracteres: letras sin tildes, números, punto, guion o guion bajo.");
            if(form.getClave()==null || form.getClave().length()<10 || form.getClave().length()>64
                    || form.getClave().getBytes(java.nio.charset.StandardCharsets.UTF_8).length>72)
                throw new IllegalArgumentException("La contraseña debe tener entre 10 y 64 caracteres y hasta 72 bytes.");
            if(!form.getClave().equals(form.getRepetirClave()))
                throw new IllegalArgumentException("Las contraseñas no coinciden.");
            if(cuentas.existsByUsuario(usuario))
                throw new IllegalArgumentException("El usuario ya existe. Elige otro o inicia sesión si ya tienes cuenta.");
            cuenta=new Cuenta(); cuenta.setUsuario(usuario); cuenta.setClaveHash(encoder.encode(form.getClave()));
            cuenta.setRol("ESTUDIANTE"); cuentas.saveAndFlush(cuenta);
        }
        s.setCuenta(cuenta);
        if(cuenta.getNombre()==null) { cuenta.setNombre(s.getContacto()); cuenta.setTelefono(s.getTelefono()); }
        solicitudes.save(s);
    }
    @Transactional
    public void confirmar(Long id) {
        var s=solicitudes.findForUpdateById(id).orElseThrow(()->new IllegalArgumentException("La solicitud no existe."));
        if(s.getEstado()!=Solicitud.Estado.PENDIENTE)
            throw new IllegalArgumentException("Esta solicitud ya fue confirmada.");
        var p=programas.findForUpdateById(s.getPrograma().getId()).orElseThrow();
        if(!p.isInscripcionesAbiertas()||matriculas.countByProgramaIdAndEstado(p.getId(),Matricula.ESTADO_ACTIVA)>=p.getCupo())
            throw new IllegalArgumentException("El grupo está cerrado o sin vacantes. Revisa el grupo antes de confirmar.");
        if(!p.getTurno().equals(s.getTurno())) throw new IllegalArgumentException("El turno solicitado no coincide con el grupo. Corrige la solicitud antes de confirmar.");
        if(matriculas.existsByDniAndProgramaIdAndIdNot(s.getDni(),p.getId(),-1L))
            throw new IllegalArgumentException("El estudiante ya tiene una matrícula en este grupo. Revisa sus matrículas antes de continuar.");
        var m=new Matricula(s.getAlumno(),s.getDni(),p.getNombre(),s.getTurno(),LocalDate.now(),Matricula.ESTADO_ACTIVA);
        m.setPrograma(p); m.setCuenta(s.getCuenta()); matriculas.saveAndFlush(m);
        cobranza.generar(m,p.getCuotas(),p.getPension());
        s.setMatricula(m); s.setEstado(Solicitud.Estado.CONFIRMADA);
    }
    @Transactional public void cerrar(Long id,Solicitud.Estado estado,String motivo,String actor) {
        var s=solicitudes.findForUpdateById(id).orElseThrow(()->new IllegalArgumentException("Solicitud no encontrada."));
        if(s.getEstado()!=Solicitud.Estado.PENDIENTE)throw new IllegalArgumentException("Solo se pueden cerrar solicitudes pendientes.");
        if(estado!=Solicitud.Estado.RECHAZADA&&estado!=Solicitud.Estado.CANCELADA)throw new IllegalArgumentException("Acción no válida.");
        if(motivo==null||motivo.isBlank()||motivo.length()>500)throw new IllegalArgumentException("Indica un motivo de hasta 500 caracteres.");
        s.setEstado(estado);s.setMotivo(motivo.trim());s.setRevisadaPor(actor);s.setFechaRevision(LocalDateTime.now());
    }
    @Transactional public void editar(Long id,InscripcionForm form) {
        var s=solicitudes.findForUpdateById(id).orElseThrow(()->new IllegalArgumentException("Solicitud no encontrada."));
        if(s.getEstado()!=Solicitud.Estado.PENDIENTE)throw new IllegalArgumentException("Solo se pueden corregir solicitudes pendientes.");
        var p=programas.findById(form.getProgramaId()).orElseThrow(()->new IllegalArgumentException("Selecciona un grupo válido."));
        if(!p.isInscripcionesAbiertas())throw new IllegalArgumentException("El grupo está cerrado.");
        if(matriculas.existsByDniAndProgramaIdAndIdNot(form.getDni(),p.getId(),-1L))throw new IllegalArgumentException("El DNI ya tiene matrícula en el grupo.");
        if(solicitudes.findAll().stream().anyMatch(x->!x.getId().equals(id)&&x.getEstado()==Solicitud.Estado.PENDIENTE&&x.getDni().equals(form.getDni())&&x.getPrograma().getId().equals(p.getId())))throw new IllegalArgumentException("Ya existe otra solicitud pendiente para ese DNI y grupo.");
        s.setAlumno(form.getAlumno().trim());s.setDni(form.getDni());s.setContacto(form.getContacto().trim());s.setTelefono(form.getTelefono().trim());s.setPrograma(p);s.setTurno(form.getTurno());
    }
}
