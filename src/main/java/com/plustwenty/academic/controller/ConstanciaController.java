package com.plustwenty.academic.controller;
import com.plustwenty.academic.repository.PagoRepository;
import com.plustwenty.academic.service.PortalService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Controller
public class ConstanciaController {
 private final PagoRepository pagos;private final PortalService acceso;
 public ConstanciaController(PagoRepository p,PortalService s){pagos=p;acceso=s;}
 @GetMapping({"/constancias/{id}","/portal/constancias/{id}"}) public String constancia(@PathVariable Long id,@RequestParam(defaultValue="false") boolean descargar,Authentication a,Model m,jakarta.servlet.http.HttpServletResponse response){boolean admin=a.getAuthorities().stream().anyMatch(x->x.getAuthority().equals("ROLE_ADMIN"));var pago=admin?pagos.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND)):acceso.pago(a.getName(),id);m.addAttribute("pago",pago);m.addAttribute("volver",admin?"/pensiones?id="+pago.getCuota().getMatricula().getId():"/portal");m.addAttribute("descargar",descargar);m.addAttribute("ruta",(admin?"/constancias/":"/portal/constancias/")+id);if(descargar)response.setHeader("Content-Disposition","attachment; filename=\"constancia-"+id+".html\"");return "constancia";}
}
