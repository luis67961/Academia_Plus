package com.plustwenty.academic.controller;
import com.plustwenty.academic.model.Solicitud;
import com.plustwenty.academic.repository.*;
import com.plustwenty.academic.service.InscripcionService;
import jakarta.validation.Valid;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.security.core.Authentication;
@Controller
public class SolicitudDetalleController {
 private final SolicitudRepository solicitudes;private final ProgramaRepository programas;private final InscripcionService service;
 public SolicitudDetalleController(SolicitudRepository s,ProgramaRepository p,InscripcionService i){solicitudes=s;programas=p;service=i;}
 private boolean admin(Authentication a){return a.getAuthorities().stream().anyMatch(x->x.getAuthority().equals("ROLE_ADMIN"));}
 private Solicitud acceso(Long id,Authentication a){var s=solicitudes.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));if(!admin(a)&&(s.getCuenta()==null||!s.getCuenta().getUsuario().equals(a.getName())))throw new ResponseStatusException(HttpStatus.NOT_FOUND);return s;}
 private void vista(Model m,Solicitud s,Authentication a){m.addAttribute("detalle",s);m.addAttribute("esAdmin",admin(a));m.addAttribute("programas",programas.findAll());m.addAttribute("turnos",MatriculaController.TURNOS);}
 @GetMapping({"/solicitudes/{id}","/portal/solicitudes/{id}"}) public String ver(@PathVariable Long id,Authentication a,Model m){var s=acceso(id,a);var f=new InscripcionForm();f.setAlumno(s.getAlumno());f.setDni(s.getDni());f.setContacto(s.getContacto());f.setTelefono(s.getTelefono());f.setProgramaId(s.getPrograma().getId());f.setTurno(s.getTurno());f.setAceptaContacto(true);m.addAttribute("datos",f);vista(m,s,a);return "solicitud-detalle";}
 @PostMapping({"/solicitudes/{id}/editar","/portal/solicitudes/{id}/editar"}) public String editar(@PathVariable Long id,@Valid @ModelAttribute("datos") InscripcionForm datos,BindingResult errors,Authentication a,Model m,RedirectAttributes r){var s=acceso(id,a);if(!errors.hasErrors())try{service.editar(id,datos);r.addFlashAttribute("success","Solicitud actualizada.");return "redirect:"+(admin(a)?"/solicitudes/":"/portal/solicitudes/")+id;}catch(IllegalArgumentException e){errors.reject("solicitud",e.getMessage());}vista(m,s,a);return "solicitud-detalle";}
 @PostMapping({"/solicitudes/{id}/cerrar","/portal/solicitudes/{id}/cancelar"}) public String cerrar(@PathVariable Long id,@RequestParam(defaultValue="CANCELADA") String estado,@RequestParam(defaultValue="Cancelada por el solicitante.") String motivo,Authentication a,RedirectAttributes r){acceso(id,a);try{service.cerrar(id,admin(a)?Solicitud.Estado.valueOf(estado):Solicitud.Estado.CANCELADA,motivo,a.getName());r.addFlashAttribute("success","Solicitud cerrada. Se conserva su historial.");}catch(IllegalArgumentException e){r.addFlashAttribute("error",e.getMessage());}return "redirect:"+(admin(a)?"/solicitudes/":"/portal/solicitudes/")+id;}
}
