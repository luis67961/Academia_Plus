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

    @GetMapping
    public String listar(Model model) {
        // Actualizado para que coincida con la variable 'matriculas' de la nueva vista
        model.addAttribute("matriculas", matriculaRepository.findAll());
        return "matriculas/list";
    }

    @GetMapping("/nuevo")
    public String formularioNueva(Model model) {
        model.addAttribute("matricula", new Matricula());
        return "matriculas/form";
    }

    @PostMapping("/guardar")
    public String guardar(@ModelAttribute Matricula matricula) {
        matriculaRepository.save(matricula);
        return "redirect:/matriculas";
    }

    @GetMapping("/editar/{id}")
    public String formularioEditar(@PathVariable Long id, Model model) {
        model.addAttribute("matricula", matriculaRepository.findById(id).orElseThrow());
        return "matriculas/form";
    }

    @PostMapping("/actualizar/{id}")
    public String actualizar(@PathVariable Long id, @ModelAttribute Matricula matricula) {
        matricula.setId(id);
        matriculaRepository.save(matricula);
        return "redirect:/matriculas";
    }

    @GetMapping("/eliminar/{id}")
    public String eliminar(@PathVariable Long id) {
        matriculaRepository.deleteById(id);
        return "redirect:/matriculas";
    }
}