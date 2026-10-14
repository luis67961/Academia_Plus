package com.plustwenty.academic.controller;

import com.plustwenty.academic.model.Matricula;
import com.plustwenty.academic.repository.MatriculaRepository;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import java.time.YearMonth;

@Controller
public class HomeController {

    private final MatriculaRepository matriculaRepository;

    public HomeController(MatriculaRepository matriculaRepository) {
        this.matriculaRepository = matriculaRepository;
    }

    @GetMapping({"/", "/dashboard"})
    public String dashboard(Model model) {
        YearMonth mes = YearMonth.now();
        model.addAttribute("totalMatriculas", matriculaRepository.count());
        model.addAttribute("activas", matriculaRepository.countByEstado(Matricula.ESTADO_ACTIVA));
        model.addAttribute("inactivas", matriculaRepository.countByEstado(Matricula.ESTADO_INACTIVA));
        model.addAttribute("nuevasMes", matriculaRepository.countByFechaBetween(mes.atDay(1), mes.atEndOfMonth()));
        model.addAttribute("ultimas", matriculaRepository.findTop5ByOrderByFechaDescIdDesc());
        return "index";
    }
}
