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
    private final com.plustwenty.academic.repository.SolicitudRepository solicitudes;
 private final com.plustwenty.academic.repository.CuotaRepository cuotas;
 private final com.plustwenty.academic.repository.PagoRepository pagos;

    public HomeController(MatriculaRepository matriculaRepository, com.plustwenty.academic.repository.CuotaRepository cuotas, com.plustwenty.academic.repository.PagoRepository pagos, com.plustwenty.academic.repository.SolicitudRepository solicitudes) { this.solicitudes=solicitudes;
 this.cuotas=cuotas;this.pagos=pagos;
        this.matriculaRepository = matriculaRepository;
    }

    @GetMapping("/dashboard")
    public String dashboard(Model model) {
        YearMonth mes = YearMonth.now();
        model.addAttribute("solicitudesPendientes",solicitudes.countByEstado(com.plustwenty.academic.model.Solicitud.Estado.PENDIENTE));
 model.addAttribute("cobrado",pagos.findAll().stream().map(com.plustwenty.academic.model.Pago::getMonto).reduce(java.math.BigDecimal.ZERO,java.math.BigDecimal::add));
 model.addAttribute("atrasado",cuotas.findAll().stream().filter(c->c.getVencimiento().isBefore(java.time.LocalDate.now())).map(com.plustwenty.academic.model.Cuota::getSaldo).reduce(java.math.BigDecimal.ZERO,java.math.BigDecimal::add));
        model.addAttribute("totalMatriculas", matriculaRepository.count());
        model.addAttribute("activas", matriculaRepository.countByEstado(Matricula.ESTADO_ACTIVA));
        model.addAttribute("inactivas", matriculaRepository.countByEstado(Matricula.ESTADO_INACTIVA));
        model.addAttribute("nuevasMes", matriculaRepository.countByFechaBetween(mes.atDay(1), mes.atEndOfMonth()));
        model.addAttribute("ultimas", matriculaRepository.findTop5ByOrderByFechaDescIdDesc());
        return "index";
    }
}
