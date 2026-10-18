package com.plustwenty.academic.controller;
import com.plustwenty.academic.model.*;
import com.plustwenty.academic.repository.*;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;
import java.security.Principal;
import java.util.*;
@Controller
public class AsistenciaController {
 private final ProgramaRepository programas;private final MatriculaRepository matriculas;private final AsistenciaRepository asistencias;
 public AsistenciaController(ProgramaRepository p,MatriculaRepository m,AsistenciaRepository a){programas=p;matriculas=m;asistencias=a;}
 @GetMapping("/asistencia") public String lista(@RequestParam(required=false) Long programaId,@RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate fecha,Model model){
  if(fecha==null)fecha=LocalDate.now();model.addAttribute("fecha",fecha);model.addAttribute("hoy",LocalDate.now());model.addAttribute("programaId",programaId);model.addAttribute("programas",programas.findAll());
  var estados=new HashMap<Long,String>();if(programaId!=null)asistencias.findByMatriculaProgramaIdAndFecha(programaId,fecha).forEach(a->estados.put(a.getMatricula().getId(),a.getEstado().name()));
  model.addAttribute("estados",estados);model.addAttribute("alumnos",programaId==null?List.of():matriculas.findByProgramaIdOrderByAlumnoAsc(programaId).stream().filter(m->m.isActiva()||estados.containsKey(m.getId())).toList());return "asistencia";
 }
 @PostMapping("/asistencia") @Transactional public String guardar(@RequestParam Long programaId,@RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate fecha,@RequestParam Map<String,String> campos,Principal principal,RedirectAttributes r){
  if(fecha.isAfter(LocalDate.now())){r.addFlashAttribute("error","No puedes registrar asistencia de una fecha futura.");return "redirect:/asistencia?programaId="+programaId;}
  var cambios=new LinkedHashMap<Matricula,Asistencia.Estado>();
  try{for(var m:matriculas.findByProgramaIdOrderByAlumnoAsc(programaId)){String valor=campos.get("estado_"+m.getId());if(valor!=null&&!valor.isBlank()){if(!m.isActiva()&&asistencias.findByMatriculaIdAndFecha(m.getId(),fecha).isEmpty())throw new IllegalArgumentException();cambios.put(m,Asistencia.Estado.valueOf(valor));}}}
  catch(IllegalArgumentException e){r.addFlashAttribute("error","Revisa los estados de asistencia y las matrículas activas.");return "redirect:/asistencia?programaId="+programaId+"&fecha="+fecha;}
  for(var cambio:cambios.entrySet()){var m=cambio.getKey();var a=asistencias.findByMatriculaIdAndFecha(m.getId(),fecha).orElseGet(Asistencia::new);a.setMatricula(m);a.setFecha(fecha);a.setEstado(cambio.getValue());a.setRegistradoPor(principal.getName());asistencias.save(a);}
  r.addFlashAttribute("success",cambios.size()+" asistencias guardadas.");return "redirect:/asistencia?programaId="+programaId+"&fecha="+fecha;
 }
}
