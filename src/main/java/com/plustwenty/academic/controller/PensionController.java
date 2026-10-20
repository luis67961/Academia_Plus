package com.plustwenty.academic.controller;
import com.plustwenty.academic.repository.*;
import com.plustwenty.academic.service.CobranzaService;
import com.plustwenty.academic.model.*;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
@Controller
public class PensionController {
 private final MatriculaRepository matriculas;private final CuotaRepository cuotas;private final PagoRepository pagos;private final CobranzaService cobranza;
 public PensionController(MatriculaRepository m,CuotaRepository c,PagoRepository p,CobranzaService s){matriculas=m;cuotas=c;pagos=p;cobranza=s;}
 @GetMapping("/pensiones") public String lista(@RequestParam(required=false) Long id,Model model){
  model.addAttribute("alumnos",matriculas.findAll());
  if(id!=null){model.addAttribute("seleccion",matriculas.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND)));model.addAttribute("cuotas",cuotas.findByMatriculaIdOrderByNumero(id));model.addAttribute("pagos",pagos.findByCuotaMatriculaIdOrderByFechaDesc(id));}
  else{model.addAttribute("cuotas",cuotas.findAll());model.addAttribute("pagos",pagos.findAllByOrderByFechaDesc());}
  model.addAttribute("saldo",cuotas.findAll().stream().map(Cuota::getSaldo).reduce(BigDecimal.ZERO,BigDecimal::add));return "pensiones/list";
 }
 @PostMapping("/pensiones/generar") public String generar(@RequestParam Long id,@RequestParam int cantidad,@RequestParam BigDecimal monto,RedirectAttributes r){
  try{cobranza.generar(matriculas.findById(id).orElseThrow(()->new IllegalArgumentException("Matrícula no encontrada.")),cantidad,monto);r.addFlashAttribute("success","Cronograma generado correctamente.");}catch(IllegalArgumentException e){r.addFlashAttribute("error",e.getMessage());}return "redirect:/pensiones?id="+id;
 }
 @PostMapping("/pensiones/pagar") public String pagar(@RequestParam Long cuotaId,@RequestParam BigDecimal monto,@RequestParam String medio,@RequestParam(defaultValue="") String referencia,RedirectAttributes r){
  try{Pago p=cobranza.pagar(cuotaId,monto,medio,referencia);r.addFlashAttribute("success","Pago registrado. Constancia interna N.º "+p.getId());return "redirect:/pensiones?id="+p.getCuota().getMatricula().getId();}catch(IllegalArgumentException e){r.addFlashAttribute("error",e.getMessage());}catch(org.springframework.dao.OptimisticLockingFailureException e){r.addFlashAttribute("error","La cuota fue modificada. Revise el saldo antes de intentar nuevamente.");}return "redirect:/pensiones";
 }
}
