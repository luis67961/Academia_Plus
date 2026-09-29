package com.plustwenty.academic.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    @GetMapping("/")
    public String home() {
        // Redirige o muestra el dashboard principal creado (index.html)
        return "index";
    }
    
    @GetMapping("/dashboard")
    public String dashboard() {
        return "index";
    }
}
