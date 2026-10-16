package com.plustwenty.academic.controller;
import com.plustwenty.academic.repository.*;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import java.security.Principal;
@Controller
public class PortalController {
 private final MatriculaRepository matriculas;private final CuotaRepository cuotas;private final PagoRepository pagos;
 public PortalController(MatriculaRepository m,CuotaRepository c,PagoRepository p){matriculas=m;cuotas=c;pagos=p;}
 @GetMapping("/login") public String login(){return "login";}
 @GetMapping("/portal") public String portal(Model model,Principal principal){
  // Demo: ambos usuarios de familia están vinculados exclusivamente al estudiante ficticio.
  var m=matriculas.findFirstByDni("72834912");
  model.addAttribute("usuario",principal.getName());
  m.ifPresent(x->{model.addAttribute("alumno",x);model.addAttribute("cuotas",cuotas.findByMatriculaIdOrderByNumero(x.getId()));model.addAttribute("pagos",pagos.findByCuotaMatriculaIdOrderByFechaDesc(x.getId()));});return "portal";
 }
}
