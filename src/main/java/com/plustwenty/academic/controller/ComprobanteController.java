package com.plustwenty.academic.controller;
import com.plustwenty.academic.repository.*;
import com.plustwenty.academic.service.*;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.security.core.Authentication;
import org.springframework.http.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;
import java.math.BigDecimal;
@Controller
public class ComprobanteController {
 private final ComprobanteRepository comprobantes;private final ComprobanteService service;private final PortalService acceso;
 public ComprobanteController(ComprobanteRepository c,ComprobanteService s,PortalService p){comprobantes=c;service=s;acceso=p;}
 @GetMapping("/portal/comprobantes/nuevo") public String formulario(@RequestParam Long cuotaId,Authentication a,Model m){m.addAttribute("cuota",acceso.cuota(a.getName(),cuotaId));return "comprobante-form";}
 @PostMapping("/portal/comprobantes") public String enviar(@RequestParam Long cuotaId,@RequestParam BigDecimal monto,@RequestParam String medio,@RequestParam String referencia,@RequestParam MultipartFile archivo,Authentication a,RedirectAttributes r)throws java.io.IOException{
  try{service.enviar(a.getName(),cuotaId,monto,medio,referencia,archivo.getBytes());r.addFlashAttribute("success","Comprobante enviado. El saldo se actualizará cuando administración verifique el pago.");}
  catch(IllegalArgumentException e){r.addFlashAttribute("error",e.getMessage());r.addFlashAttribute("monto",monto);r.addFlashAttribute("medio",medio);r.addFlashAttribute("referencia",referencia);return "redirect:/portal/comprobantes/nuevo?cuotaId="+cuotaId;}
  catch(org.springframework.dao.DataIntegrityViolationException e){r.addFlashAttribute("error","Este número de operación ya se presentó. Revisa tus comprobantes.");}
  return "redirect:/portal";
 }
 @GetMapping("/comprobantes") public String lista(@RequestParam(defaultValue="") String estado,@RequestParam(defaultValue="") String q,Model m){m.addAttribute("estado",estado);m.addAttribute("q",q);m.addAttribute("comprobantes",comprobantes.findAllByOrderByFechaDesc().stream().filter(c->estado.isBlank()||c.getEstado().name().equals(estado)).filter(c->(c.getCuota().getMatricula().getAlumno()+" "+c.getReferencia()).toLowerCase(java.util.Locale.ROOT).contains(q.toLowerCase(java.util.Locale.ROOT))).toList());return "comprobantes";}
 @PostMapping("/comprobantes/{id}/revisar") public String revisar(@PathVariable Long id,@RequestParam boolean aprobar,@RequestParam(defaultValue="") String motivo,Authentication a,RedirectAttributes r){try{service.revisar(id,aprobar,motivo,a.getName());r.addFlashAttribute("success",aprobar?"Comprobante aprobado y pago registrado.":"Comprobante rechazado con motivo.");}catch(IllegalArgumentException e){r.addFlashAttribute("error",e.getMessage());}catch(org.springframework.dao.DataIntegrityViolationException|org.springframework.dao.OptimisticLockingFailureException e){r.addFlashAttribute("error","La operación o el saldo cambió. Revisa el historial antes de continuar.");}return "redirect:/comprobantes";}
 @GetMapping({"/comprobantes/{id}/archivo","/portal/comprobantes/{id}/archivo"}) public ResponseEntity<byte[]> archivo(@PathVariable Long id,Authentication a){var c=comprobantes.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));boolean admin=a.getAuthorities().stream().anyMatch(x->x.getAuthority().equals("ROLE_ADMIN"));if(!admin&&!c.getCuenta().getUsuario().equals(a.getName()))throw new ResponseStatusException(HttpStatus.NOT_FOUND);String ext="application/pdf".equals(c.getTipo())?"pdf":"image/png".equals(c.getTipo())?"png":"jpg";return ResponseEntity.ok().contentType(MediaType.parseMediaType(c.getTipo())).header("Content-Disposition","attachment; filename=\"comprobante-"+id+"."+ext+"\"").header("X-Content-Type-Options","nosniff").body(c.getArchivo());}
}
