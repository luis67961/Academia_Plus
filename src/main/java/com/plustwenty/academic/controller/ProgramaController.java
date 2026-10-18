package com.plustwenty.academic.controller;
import com.plustwenty.academic.model.Programa;
import com.plustwenty.academic.repository.ProgramaRepository;
import com.plustwenty.academic.service.ProgramaService;
import jakarta.validation.Valid;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Controller
public class ProgramaController {
 private final ProgramaRepository programas;private final ProgramaService service;
 public ProgramaController(ProgramaRepository p,ProgramaService s){programas=p;service=s;}
 private void catalogo(Model m){m.addAttribute("programas",programas.findAll());m.addAttribute("vacantes",programas.findAll().stream().collect(java.util.stream.Collectors.toMap(Programa::getId,service::disponibles)));}
 @GetMapping("/programas") public String lista(@RequestParam(defaultValue="") String q,Model m){catalogo(m);m.addAttribute("q",q);m.addAttribute("programas",programas.findAll().stream().filter(p->(p.getNombre()+" "+p.getGrupo()+" "+p.getDocente()).toLowerCase(java.util.Locale.ROOT).contains(q.toLowerCase(java.util.Locale.ROOT))).toList());m.addAttribute("programa",new Programa());return "programas";}
 @GetMapping("/programas/{id}/editar") public String editar(@PathVariable Long id,Model m){catalogo(m);m.addAttribute("programa",programas.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND)));return "programas";}
 @PostMapping({"/programas","/programas/{id}/editar"}) public String guardar(@PathVariable(required=false) Long id,@Valid @ModelAttribute Programa programa,BindingResult errors,Model m,RedirectAttributes r){
  programa.setId(id);if(!errors.hasErrors())try{service.guardar(id,programa);r.addFlashAttribute("success","Curso y grupo guardados.");return "redirect:/programas";}catch(IllegalArgumentException e){errors.reject("grupo",e.getMessage());}
  catalogo(m);return "programas";
 }
}
