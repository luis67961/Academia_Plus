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
        solicitudes.save(s);
    }
    @Transactional
    public void confirmar(Long id) {
        var s=solicitudes.findForUpdateById(id).orElseThrow(()->new IllegalArgumentException("La solicitud no existe."));
        if(s.getEstado()!=Solicitud.Estado.PENDIENTE)
            throw new IllegalArgumentException("Esta solicitud ya fue confirmada.");
        var p=s.getPrograma();
        if(matriculas.existsByDniAndProgramaIdAndIdNot(s.getDni(),p.getId(),-1L))
            throw new IllegalArgumentException("El estudiante ya tiene una matrícula en este grupo. Revisa sus matrículas antes de continuar.");
        var m=new Matricula(s.getAlumno(),s.getDni(),p.getNombre(),s.getTurno(),LocalDate.now(),Matricula.ESTADO_ACTIVA);
        m.setPrograma(p); matriculas.saveAndFlush(m);
        cobranza.generar(m,p.getCuotas(),p.getPension());
        s.setMatricula(m); s.setEstado(Solicitud.Estado.CONFIRMADA);
    }
}
