package com.plustwenty.academic.controller;

import com.plustwenty.academic.repository.CuentaRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import java.security.Principal;

@Controller
public class PerfilController {
    private final CuentaRepository cuentas;
    private final PasswordEncoder encoder;
    public PerfilController(CuentaRepository c,PasswordEncoder e){cuentas=c;encoder=e;}
    @Getter @Setter public static class Datos {
        @NotBlank(message="Indica tu nombre.") @Size(max=120) private String nombre;
        @NotBlank @Pattern(regexp="[+0-9 ()-]{7,20}",message="Indica un teléfono válido.") private String telefono;
        @Email(message="Revisa el correo electrónico.") @Size(max=160) private String email;
    }
    @GetMapping("/perfil") public String perfil(Principal principal,Model model) {
        var c=cuentas.findByUsuario(principal.getName()).orElseThrow();
        var d=new Datos(); d.setNombre(c.getNombre());d.setTelefono(c.getTelefono());d.setEmail(c.getEmail());
        model.addAttribute("datos",d);model.addAttribute("usuario",c.getUsuario());return "perfil";
    }
    @PostMapping("/perfil") @Transactional
    public String guardar(@Valid @ModelAttribute("datos") Datos datos,BindingResult errors,Principal principal,Model model,RedirectAttributes r) {
        model.addAttribute("usuario",principal.getName());
        if(errors.hasErrors()) return "perfil";
        var c=cuentas.findByUsuario(principal.getName()).orElseThrow();
        var email=datos.getEmail()==null ? "" : datos.getEmail().trim().toLowerCase(java.util.Locale.ROOT);
        if(!email.isEmpty() && cuentas.existsByEmailIgnoreCaseAndIdNot(email,c.getId())) {
            errors.rejectValue("email","duplicado","Este correo ya está asociado a otra cuenta.");
            return "perfil";
        }
        c.setNombre(datos.getNombre().trim());c.setTelefono(datos.getTelefono().trim());c.setEmail(email.isEmpty()?null:email);
        r.addFlashAttribute("success","Tus datos de contacto se actualizaron.");return "redirect:/perfil";
    }
    @PostMapping("/perfil/clave") @Transactional
    public String clave(@RequestParam String actual,@RequestParam String nueva,@RequestParam String repetir,Principal principal,
                        jakarta.servlet.http.HttpServletRequest request,RedirectAttributes r) {
        var c=cuentas.findByUsuario(principal.getName()).orElseThrow();
        if(!encoder.matches(actual,c.getClaveHash())) { r.addFlashAttribute("error","La contraseña actual no es correcta.");return "redirect:/perfil"; }
        if(nueva.length()<10 || nueva.length()>64 || nueva.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>72 || !nueva.equals(repetir)) {
            r.addFlashAttribute("error","Usa entre 10 y 64 caracteres y repite la misma contraseña (hasta 72 bytes).");return "redirect:/perfil";
        }
        c.setClaveHash(encoder.encode(nueva));
        request.getSession().invalidate();org.springframework.security.core.context.SecurityContextHolder.clearContext();
        return "redirect:/login?claveActualizada";
    }
}
