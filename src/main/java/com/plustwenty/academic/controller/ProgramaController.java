package com.plustwenty.academic.controller;
import com.plustwenty.academic.model.Programa;
import com.plustwenty.academic.repository.ProgramaRepository;
import jakarta.validation.Valid;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
@Controller
public class ProgramaController {
 private final ProgramaRepository programas;
 public ProgramaController(ProgramaRepository p){programas=p;}
 @GetMapping("/programas") public String lista(Model m){m.addAttribute("programas",programas.findAll());m.addAttribute("programa",new Programa());return "programas";}
 @PostMapping("/programas") public String guardar(@Valid @ModelAttribute Programa programa,BindingResult errors,Model m,RedirectAttributes r){
  programa.setId(null);if(!java.util.List.of("Matemática","Oratoria","Locución","Podcast").contains(programa.getNombre()))errors.rejectValue("nombre","invalido","Seleccione uno de los cuatro cursos.");if(errors.hasErrors()){m.addAttribute("programas",programas.findAll());return "programas";}programas.save(programa);r.addFlashAttribute("success","Ciclo y grupo registrados.");return "redirect:/programas";
 }
}
