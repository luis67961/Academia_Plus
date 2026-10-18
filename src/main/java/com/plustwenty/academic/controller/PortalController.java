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
    private final CuotaRepository cuotas;
    private final PagoRepository pagos;
    private final SolicitudRepository solicitudes;
    public PortalController(MatriculaRepository m,CuotaRepository c,PagoRepository p,SolicitudRepository s) {
        matriculas=m; cuotas=c; pagos=p; solicitudes=s;
    }
    @GetMapping("/login") public String login(){return "login";}
    public record Detalle(Matricula matricula,List<Cuota> cuotas,List<Pago> pagos) {}
    @GetMapping("/portal") public String portal(Model model,Principal principal) {
        String usuario=principal.getName();
        var propias=solicitudes.findByCuentaUsuarioOrderByFechaDescIdDesc(usuario);
        var inscritas=new LinkedHashMap<Long,Matricula>();
        for(var s:propias) if(s.getMatricula()!=null) inscritas.put(s.getMatricula().getId(),s.getMatricula());
        // These reserved demo logins retain their original fictitious student only.
        if(Set.of("padre","estudiante").contains(usuario))
            matriculas.findFirstByDni("72834912").ifPresent(m->inscritas.put(m.getId(),m));
        var detalles=inscritas.values().stream().map(m->new Detalle(m,
            cuotas.findByMatriculaIdOrderByNumero(m.getId()),pagos.findByCuotaMatriculaIdOrderByFechaDesc(m.getId()))).toList();
        model.addAttribute("usuario",usuario);
        model.addAttribute("misSolicitudes",propias);
        model.addAttribute("detalles",detalles);
        return "portal";
    }
}
