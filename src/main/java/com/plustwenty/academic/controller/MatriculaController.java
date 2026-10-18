package com.plustwenty.academic.controller;

import com.plustwenty.academic.model.Matricula;
import com.plustwenty.academic.repository.MatriculaRepository;
import jakarta.persistence.criteria.Predicate;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.io.IOException;
import java.io.PrintWriter;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Controlador encargado de gestionar las operaciones CRUD
 * de las matriculas de estudiantes en el sistema: listado con
 * busqueda, filtros, orden y paginacion; registro y edicion con
 * validacion; cambio de estado; eliminacion y exportacion a CSV.
 */
@Controller
@RequestMapping("/matriculas")
public class MatriculaController {

    public static final List<String> CURSOS = List.of("Matemática", "Oratoria", "Locución", "Podcast");
    public static final List<String> TURNOS = List.of("Mañana", "Tarde", "Noche");
    public static final List<String> ESTADOS = List.of(Matricula.ESTADO_ACTIVA, Matricula.ESTADO_INACTIVA);

    private static final Map<String, String> CAMPOS_ORDEN = Map.of(
            "alumno", "alumno", "dni", "dni", "curso", "curso",
            "turno", "turno", "fecha", "fecha", "estado", "estado");
    private static final DateTimeFormatter FECHA_CSV = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final com.plustwenty.academic.repository.ProgramaRepository programas;
    private final com.plustwenty.academic.service.CobranzaService cobranza;
    private final MatriculaRepository matriculaRepository;
    private final com.plustwenty.academic.repository.CuotaRepository cuotas;

    public MatriculaController(MatriculaRepository matriculaRepository, com.plustwenty.academic.repository.CuotaRepository cuotas, com.plustwenty.academic.repository.ProgramaRepository programas, com.plustwenty.academic.service.CobranzaService cobranza) {
        this.programas=programas;this.cobranza=cobranza;
        this.cuotas = cuotas;
        this.matriculaRepository = matriculaRepository;
    }

    /**
     * Muestra el listado de matriculas con busqueda por DNI o nombre,
     * filtros por estado y turno, orden por columna y paginacion.
     */
    @GetMapping
    public String listar(@RequestParam(required = false) String q,
                         @RequestParam(required = false) String estado,
                         @RequestParam(required = false) String turno,
                         @RequestParam(defaultValue = "fecha") String sort,
                         @RequestParam(defaultValue = "desc") String dir,
                         @RequestParam(defaultValue = "0") int page,
                         @RequestParam(defaultValue = "10") int size,
                         Model model) {
        q = limpiar(q);
        estado = limpiar(estado);
        turno = limpiar(turno);

        String campoOrden = CAMPOS_ORDEN.getOrDefault(sort, "fecha");
        Sort.Direction direccion = "asc".equalsIgnoreCase(dir) ? Sort.Direction.ASC : Sort.Direction.DESC;
        int tamano = Math.min(Math.max(size, 5), 100);
        Pageable pageable = PageRequest.of(Math.max(page, 0), tamano,
                Sort.by(direccion, campoOrden).and(Sort.by(Sort.Direction.DESC, "id")));

        Page<Matricula> pagina = matriculaRepository.findAll(filtro(q, estado, turno), pageable);

        model.addAttribute("pagina", pagina);
        model.addAttribute("matriculas", pagina.getContent());
        model.addAttribute("q", q);
        model.addAttribute("estado", estado);
        model.addAttribute("turno", turno);
        model.addAttribute("sort", campoOrden);
        model.addAttribute("dir", direccion.name().toLowerCase());
        model.addAttribute("size", tamano);
        model.addAttribute("turnos", TURNOS);
        model.addAttribute("estados", ESTADOS);
        agregarResumen(model);
        return "matriculas/list";
    }

    @GetMapping("/nuevo")
    public String formularioNueva(Model model) {
        Matricula matricula = new Matricula();
        matricula.setFecha(LocalDate.now());
        matricula.setEstado(Matricula.ESTADO_ACTIVA);
        model.addAttribute("matricula", matricula);
        cargarCatalogos(model);
        return "matriculas/form";
    }

    @org.springframework.transaction.annotation.Transactional
    @PostMapping("/guardar")
    public String guardar(@Valid @ModelAttribute("matricula") Matricula matricula,
                          BindingResult result, Model model, RedirectAttributes redirect) {
        matricula.setId(null);
        validarDniUnico(matricula, result);
        if (result.hasErrors()) {
            cargarCatalogos(model);
            return "matriculas/form";
        }
        matriculaRepository.save(matricula);
        cobranza.generar(matricula,matricula.getPrograma().getCuotas(),matricula.getPrograma().getPension());
        redirect.addFlashAttribute("success", "Matrícula registrada y cronograma de pensiones generado.");
        return "redirect:/matriculas";
    }

    @GetMapping("/editar/{id}")
    public String formularioEditar(@PathVariable Long id, Model model, RedirectAttributes redirect) {
        Optional<Matricula> matricula = matriculaRepository.findById(id);
        if (matricula.isEmpty()) {
            redirect.addFlashAttribute("error", "La matrícula solicitada no existe.");
            return "redirect:/matriculas";
        }
        model.addAttribute("matricula", matricula.get());
        cargarCatalogos(model);
        return "matriculas/form";
    }

    @PostMapping("/actualizar/{id}")
    public String actualizar(@PathVariable Long id,
                             @Valid @ModelAttribute("matricula") Matricula matricula,
                             BindingResult result, Model model, RedirectAttributes redirect) {
        if (!matriculaRepository.existsById(id)) {
            redirect.addFlashAttribute("error", "La matrícula solicitada no existe.");
            return "redirect:/matriculas";
        }
        matricula.setId(id);
        validarDniUnico(matricula, result);
        if (result.hasErrors()) {
            cargarCatalogos(model);
            return "matriculas/form";
        }
        matriculaRepository.save(matricula);
        redirect.addFlashAttribute("success", "Matrícula de " + matricula.getAlumno() + " actualizada correctamente.");
        return "redirect:/matriculas";
    }

    /** Alterna el estado entre ACTIVA e INACTIVA (dar de baja / reactivar). */
    @PostMapping("/estado/{id}")
    public String cambiarEstado(@PathVariable Long id, RedirectAttributes redirect) {
        Optional<Matricula> encontrada = matriculaRepository.findById(id);
        if (encontrada.isEmpty()) {
            redirect.addFlashAttribute("error", "La matrícula solicitada no existe.");
            return "redirect:/matriculas";
        }
        Matricula matricula = encontrada.get();
        boolean reactivar = !matricula.isActiva();
        matricula.setEstado(reactivar ? Matricula.ESTADO_ACTIVA : Matricula.ESTADO_INACTIVA);
        matriculaRepository.save(matricula);
        redirect.addFlashAttribute("success", reactivar
                ? "Matrícula de " + matricula.getAlumno() + " reactivada."
                : "Matrícula de " + matricula.getAlumno() + " dada de baja.");
        return "redirect:/matriculas";
    }

    @PostMapping("/eliminar/{id}")
    public String eliminar(@PathVariable Long id, RedirectAttributes redirect) {
        Optional<Matricula> encontrada = matriculaRepository.findById(id);
        if (encontrada.isEmpty()) {
            redirect.addFlashAttribute("error", "La matrícula solicitada no existe.");
            return "redirect:/matriculas";
        }
        if (cuotas.existsByMatriculaId(id)) {
            redirect.addFlashAttribute("error", "Esta matrícula tiene cuotas. Use la opción de baja para conservar su historial.");
            return "redirect:/matriculas";
        }
        matriculaRepository.deleteById(id);
        redirect.addFlashAttribute("success", "Matrícula de " + encontrada.get().getAlumno() + " eliminada.");
        return "redirect:/matriculas";
    }

    /** Exporta a CSV las matriculas que coinciden con los filtros activos. */
    @GetMapping("/exportar")
    public void exportar(@RequestParam(required = false) String q,
                         @RequestParam(required = false) String estado,
                         @RequestParam(required = false) String turno,
                         HttpServletResponse response) throws IOException {
        List<Matricula> lista = matriculaRepository.findAll(
                filtro(limpiar(q), limpiar(estado), limpiar(turno)),
                Sort.by(Sort.Direction.DESC, "fecha").and(Sort.by(Sort.Direction.DESC, "id")));

        response.setContentType("text/csv");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"matriculas_" + LocalDate.now() + ".csv\"");

        PrintWriter out = response.getWriter();
        out.write('﻿'); // BOM para que Excel reconozca UTF-8
        out.println("DNI;Estudiante;Curso;Turno;Fecha de registro;Estado");
        for (Matricula m : lista) {
            out.println(String.join(";",
                    csv(m.getDni()), csv(m.getAlumno()), csv(m.getCurso()), csv(m.getTurno()),
                    m.getFecha() == null ? "" : m.getFecha().format(FECHA_CSV), csv(m.getEstado())));
        }
        out.flush();
    }

    // ---------- helpers ----------

    private Specification<Matricula> filtro(String q, String estado, String turno) {
        return (root, query, cb) -> {
            List<Predicate> predicados = new ArrayList<>();
            if (q != null) {
                String patron = "%" + q.toLowerCase() + "%";
                predicados.add(cb.or(
                        cb.like(cb.lower(root.get("alumno")), patron),
                        cb.like(root.get("dni"), patron)));
            }
            if (estado != null) predicados.add(cb.equal(root.get("estado"), estado));
            if (turno != null) predicados.add(cb.equal(root.get("turno"), turno));
            return cb.and(predicados.toArray(new Predicate[0]));
        };
    }

    private void validarDniUnico(Matricula matricula, BindingResult result) {
        if (matricula.getDni() == null || result.hasFieldErrors("dni")) return;
        if (!TURNOS.contains(matricula.getTurno())) result.rejectValue("turno","invalido","Turno inválido.");
        if (!ESTADOS.contains(matricula.getEstado())) result.rejectValue("estado","invalido","Estado inválido.");
        if (matricula.getPrograma()==null || matricula.getPrograma().getId()==null) {
            result.rejectValue("programa","obligatorio","Seleccione un curso y grupo.");return;
        }
        var elegido=programas.findById(matricula.getPrograma().getId());
        if(elegido.isEmpty()){result.rejectValue("programa","invalido","Curso no encontrado.");return;}
        matricula.setPrograma(elegido.get());
        matricula.setCurso(elegido.get().getNombre());
        if(matricula.getId()==null){
            var grupo=programas.findForUpdateById(elegido.get().getId()).orElseThrow();
            if(!grupo.isInscripcionesAbiertas()||matriculaRepository.countByProgramaIdAndEstado(grupo.getId(),Matricula.ESTADO_ACTIVA)>=grupo.getCupo())
                result.rejectValue("programa","lleno","El grupo está cerrado o sin vacantes.");
            if(!grupo.getTurno().equals(matricula.getTurno()))result.rejectValue("turno","invalido","El turno debe coincidir con el grupo elegido.");
        }
        Long actual=matricula.getId()==null?-1L:matricula.getId();
        if(matriculasConCuotasModificadas(matricula)) result.rejectValue("programa","bloqueado","No puede cambiar el curso de una matrícula con cuotas. Registre una nueva matrícula.");
        if(matriculaRepository.existsByDniAndProgramaIdAndIdNot(matricula.getDni(),elegido.get().getId(),actual))result.rejectValue("dni","duplicado","El estudiante ya tiene matrícula en este curso y grupo.");
    }

    private boolean matriculasConCuotasModificadas(Matricula m){
        if(m.getId()==null||!cuotas.existsByMatriculaId(m.getId()))return false;
        var anterior=matriculaRepository.findById(m.getId()).orElseThrow();
        return anterior.getPrograma()==null||!anterior.getPrograma().getId().equals(m.getPrograma().getId());
    }
    private void cargarCatalogos(Model model) {
        model.addAttribute("programas",programas.findAll());
        model.addAttribute("cursos", CURSOS);
        model.addAttribute("turnos", TURNOS);
        model.addAttribute("estados", ESTADOS);
    }

    private void agregarResumen(Model model) {
        YearMonth mes = YearMonth.now();
        model.addAttribute("total", matriculaRepository.count());
        model.addAttribute("activas", matriculaRepository.countByEstado(Matricula.ESTADO_ACTIVA));
        model.addAttribute("inactivas", matriculaRepository.countByEstado(Matricula.ESTADO_INACTIVA));
        model.addAttribute("nuevasMes", matriculaRepository.countByFechaBetween(mes.atDay(1), mes.atEndOfMonth()));
    }

    private static String limpiar(String valor) {
        if (valor == null) return null;
        String limpio = valor.trim();
        return limpio.isEmpty() ? null : limpio;
    }

    private static String csv(String valor) {
        if (valor == null) return "";
        if (valor.contains(";") || valor.contains("\"") || valor.contains("\n")) {
            return "\"" + valor.replace("\"", "\"\"") + "\"";
        }
        return valor;
    }
}
