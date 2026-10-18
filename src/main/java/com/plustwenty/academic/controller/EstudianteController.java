package com.plustwenty.academic.controller;
import com.plustwenty.academic.model.*;
import com.plustwenty.academic.repository.*;
import jakarta.validation.Valid;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
@Controller
public class EstudianteController {
 private final MatriculaRepository matriculas;private final FichaEstudianteRepository fichas;private final CuentaRepository cuentas;private final SolicitudRepository solicitudes;private final CuotaRepository cuotas;private final PagoRepository pagos;
 public EstudianteController(MatriculaRepository m,FichaEstudianteRepository f,CuentaRepository c,SolicitudRepository s,CuotaRepository q,PagoRepository p){matriculas=m;fichas=f;cuentas=c;solicitudes=s;cuotas=q;pagos=p;}
 public record Resumen(String dni,String nombre,long matriculas){}
 @GetMapping("/estudiantes") public String lista(@RequestParam(defaultValue="") String q,Model model){var grupos=matriculas.findAll().stream().collect(java.util.stream.Collectors.groupingBy(Matricula::getDni));var lista=grupos.entrySet().stream().map(e->new Resumen(e.getKey(),e.getValue().getFirst().getAlumno(),e.getValue().size())).filter(e->(e.dni()+" "+e.nombre()).toLowerCase(Locale.ROOT).contains(q.toLowerCase(Locale.ROOT))).sorted(Comparator.comparing(Resumen::nombre)).toList();model.addAttribute("estudiantes",lista);model.addAttribute("q",q);return "estudiantes";}
 private void catalogos(String dni,Model m){var lista=matriculas.findByDniOrderByFechaDesc(dni);if(lista.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND);m.addAttribute("matriculas",lista);m.addAttribute("cuentas",cuentas.findAll().stream().filter(c->!"ADMIN".equals(c.getRol())).toList());m.addAttribute("historialPagos",lista.stream().flatMap(x->pagos.findByCuotaMatriculaIdOrderByFechaDesc(x.getId()).stream()).sorted(Comparator.comparing(Pago::getFecha).reversed()).toList());m.addAttribute("saldo",lista.stream().flatMap(x->cuotas.findByMatriculaIdOrderByNumero(x.getId()).stream()).map(Cuota::getSaldo).reduce(java.math.BigDecimal.ZERO,java.math.BigDecimal::add));}
 @GetMapping("/estudiantes/{dni}") public String ficha(@PathVariable String dni,Model m){catalogos(dni,m);var f=fichas.findById(dni).orElseGet(()->{var n=new FichaEstudiante();n.setDni(dni);n.setNombre(matriculas.findByDniOrderByFechaDesc(dni).getFirst().getAlumno());solicitudes.findAll().stream().filter(s->s.getDni().equals(dni)).findFirst().ifPresent(s->{n.setContacto(s.getContacto());n.setTelefono(s.getTelefono());});return n;});m.addAttribute("ficha",f);return "estudiante-detalle";}
 @PostMapping("/estudiantes/{dni}") @Transactional public String guardar(@PathVariable String dni,@Valid @ModelAttribute("ficha") FichaEstudiante ficha,BindingResult errors,Model m,RedirectAttributes r){ficha.setDni(dni);catalogos(dni,m);if(errors.hasErrors())return "estudiante-detalle";fichas.save(ficha);for(var x:matriculas.findByDniOrderByFechaDesc(dni))x.setAlumno(ficha.getNombre().trim());r.addFlashAttribute("success","Ficha y nombre del estudiante actualizados.");return "redirect:/estudiantes/"+dni;}
 @PostMapping("/estudiantes/{dni}/vincular") @Transactional public String vincular(@PathVariable String dni,@RequestParam Long matriculaId,@RequestParam Long cuentaId,@RequestParam(defaultValue="false") boolean identidadVerificada,RedirectAttributes r){var m=matriculas.findById(matriculaId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));if(!m.getDni().equals(dni))throw new ResponseStatusException(HttpStatus.NOT_FOUND);var c=cuentas.findById(cuentaId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));if(!identidadVerificada||"ADMIN".equals(c.getRol())){r.addFlashAttribute("error","Verifica la identidad y selecciona una cuenta de estudiante o apoderado.");return "redirect:/estudiantes/"+dni;}
  if(m.getCuenta()!=null&&!m.getCuenta().getId().equals(cuentaId)){r.addFlashAttribute("error","La matrícula ya pertenece a otra cuenta. No se transfirió su acceso.");return "redirect:/estudiantes/"+dni;}
  var solicitud=solicitudes.findAll().stream().filter(s->s.getMatricula()!=null&&s.getMatricula().getId().equals(matriculaId)&&s.getCuenta()!=null&&!s.getCuenta().getId().equals(cuentaId)).findFirst();if(solicitud.isPresent()){r.addFlashAttribute("error","La solicitud original está vinculada a otra cuenta. Revisa su titularidad.");return "redirect:/estudiantes/"+dni;}
  m.setCuenta(c);r.addFlashAttribute("success","Matrícula vinculada. La cuenta seleccionada podrá consultar sus cuotas y pagos.");return "redirect:/estudiantes/"+dni;}
}
