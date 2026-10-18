package com.plustwenty.academic.controller;
import com.plustwenty.academic.model.*;
import com.plustwenty.academic.repository.*;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import java.security.Principal;
import java.util.*;
@Controller
public class PortalController {
    private final MatriculaRepository matriculas;
    private final com.plustwenty.academic.service.PortalService acceso;
    private final CuotaRepository cuotas;
    private final PagoRepository pagos;
    private final SolicitudRepository solicitudes;
    private final ComprobanteRepository comprobantes;
    private final AsistenciaRepository asistencias;
    public PortalController(MatriculaRepository m,CuotaRepository c,PagoRepository p,SolicitudRepository s, com.plustwenty.academic.service.PortalService acceso,ComprobanteRepository comprobantes,AsistenciaRepository asistencias) { this.comprobantes=comprobantes;this.asistencias=asistencias; this.acceso=acceso;
        matriculas=m; cuotas=c; pagos=p; solicitudes=s;
    }
    @GetMapping("/login") public String login(){return "login";}
    public record Detalle(Matricula matricula,List<Cuota> cuotas,List<Pago> pagos) {}
    @GetMapping("/portal") public String portal(Model model,Principal principal) {
        String usuario=principal.getName();
        var propias=solicitudes.findByCuentaUsuarioOrderByFechaDescIdDesc(usuario);
        var inscritas=acceso.matriculas(usuario);
        var detalles=inscritas.stream().map(m->new Detalle(m,
            cuotas.findByMatriculaIdOrderByNumero(m.getId()),pagos.findByCuotaMatriculaIdOrderByFechaDesc(m.getId()))).toList();
        var todas=detalles.stream().flatMap(d->d.cuotas().stream()).toList();
        model.addAttribute("saldoTotal",todas.stream().map(Cuota::getSaldo).reduce(java.math.BigDecimal.ZERO,java.math.BigDecimal::add));
        model.addAttribute("proximaCuota",todas.stream().filter(c->c.getSaldo().signum()>0).min(java.util.Comparator.comparing(Cuota::getVencimiento)).orElse(null));
        model.addAttribute("usuario",usuario);
        model.addAttribute("misSolicitudes",propias);
        model.addAttribute("detalles",detalles);
        model.addAttribute("misComprobantes",comprobantes.findByCuentaUsuarioOrderByFechaDesc(usuario));
        model.addAttribute("misAsistencias",inscritas.stream().flatMap(m->asistencias.findByMatriculaIdOrderByFechaDesc(m.getId()).stream()).sorted(java.util.Comparator.comparing(Asistencia::getFecha).reversed()).toList());
        return "portal";
    }
}
