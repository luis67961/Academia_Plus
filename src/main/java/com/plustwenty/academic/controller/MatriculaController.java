package com.plustwenty.academic.controller;
import com.plustwenty.academic.model.Matricula;
import com.plustwenty.academic.repository.MatriculaRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
@Controller
@RequestMapping("/matriculas")
public class MatriculaController {

    @Autowired
    private MatriculaRepository matriculaRepository;


    @GetMapping("/nueva")
    public String formularioNueva(Model model) {
        model.addAttribute("matricula", new Matricula());
        return "formulario";
    }

    @PostMapping
    public String guardar(@ModelAttribute Matricula matricula) {
        matriculaRepository.save(matricula);
        return "redirect:/matriculas";
    }

}