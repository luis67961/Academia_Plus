package com.plustwenty.academic.controller;

import com.plustwenty.academic.repository.*;
import com.plustwenty.academic.service.InscripcionService;
import jakarta.validation.Valid;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class InscripcionController {
    private final ProgramaRepository programas;
    private final SolicitudRepository solicitudes;
    private final InscripcionService inscripciones;
    public InscripcionController(ProgramaRepository p, SolicitudRepository s, InscripcionService i) {
        programas=p; solicitudes=s; inscripciones=i;
    }
    @GetMapping({"/", "/cursos"})
    public String cursos(Model model) { model.addAttribute("programas",programas.findAll()); return "cursos"; }
    @GetMapping("/inscripcion")
    public String formulario(@RequestParam(required=false) Long programaId, Model model, java.security.Principal principal) {
        var form=new InscripcionForm(); form.setProgramaId(programaId);
        model.addAttribute("solicitud",form); catalogos(model,principal); return "inscripcion";
    }
    @PostMapping("/inscripcion")
    public String enviar(@Valid @ModelAttribute("solicitud") InscripcionForm form, BindingResult result, Model model, java.security.Principal principal) {
        if(!result.hasErrors()) {
            try { inscripciones.solicitar(form,principal==null ? null : principal.getName()); return "redirect:/inscripcion/recibida"; }
            catch(IllegalArgumentException e) { result.reject("solicitud",e.getMessage()); }
            catch(org.springframework.dao.DataIntegrityViolationException e) { result.reject("solicitud","No se pudo registrar. El usuario o la matrícula ya existen. Revisa los datos o inicia sesión."); }
        }
        form.setClave(null); form.setRepetirClave(null);
        catalogos(model,principal); return "inscripcion";
    }
    @GetMapping("/inscripcion/recibida")
    public String recibida() { return "inscripcion-recibida"; }
    @GetMapping("/solicitudes")
    public String solicitudes(Model model) {
        model.addAttribute("solicitudes",solicitudes.findAllByOrderByFechaDescIdDesc());
        return "solicitudes";
    }
    @PostMapping("/solicitudes/{id}/confirmar")
    public String confirmar(@PathVariable Long id, RedirectAttributes redirect) {
        try { inscripciones.confirmar(id); redirect.addFlashAttribute("success","Solicitud confirmada. Se creó la matrícula y su cronograma de pensiones."); }
        catch(IllegalArgumentException e) { redirect.addFlashAttribute("error",e.getMessage()); }
        catch(org.springframework.dao.DataIntegrityViolationException e) { redirect.addFlashAttribute("error","Ya existe una matrícula para este DNI y grupo. Revisa las matrículas."); }
        return "redirect:/solicitudes";
    }
    private void catalogos(Model model, java.security.Principal principal) {
        model.addAttribute("usuarioActual",principal==null ? null : principal.getName());
        model.addAttribute("programas",programas.findAll());
        model.addAttribute("turnos",MatriculaController.TURNOS);
    }
}
