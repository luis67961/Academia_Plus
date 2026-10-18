package com.plustwenty.academic.controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
@ControllerAdvice
public class ArchivoExceptionHandler {
 @ExceptionHandler(MaxUploadSizeExceededException.class) public String demasiadoGrande(RedirectAttributes r){r.addFlashAttribute("error","El archivo supera el límite de 5 MB. Selecciona un archivo más pequeño.");return "redirect:/portal";}
}
