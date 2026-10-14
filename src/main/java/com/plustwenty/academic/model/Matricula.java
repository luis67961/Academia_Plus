package com.plustwenty.academic.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;

/**
 * Entidad que representa la matricula de un estudiante en un curso.
 */
@Entity
public class Matricula {

    public static final String ESTADO_ACTIVA = "ACTIVA";
    public static final String ESTADO_INACTIVA = "INACTIVA";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "El nombre del estudiante es obligatorio")
    @Size(max = 120, message = "El nombre no puede superar 120 caracteres")
    @Column(length = 120)
    private String alumno;

    @NotBlank(message = "El DNI es obligatorio")
    @Pattern(regexp = "\\d{8}", message = "El DNI debe tener exactamente 8 dígitos")
    @Column(length = 8)
    private String dni;

    @NotBlank(message = "Seleccione un curso")
    @Column(length = 80)
    private String curso;

    @NotBlank(message = "Seleccione un turno")
    @Column(length = 20)
    private String turno;

    @NotNull(message = "La fecha de registro es obligatoria")
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate fecha;

    @NotBlank(message = "Seleccione un estado")
    @Column(length = 20)
    private String estado;

    public Matricula() {}

    public Matricula(String alumno, String dni, String curso, String turno, LocalDate fecha, String estado) {
        this.alumno = alumno;
        this.dni = dni;
        this.curso = curso;
        this.turno = turno;
        this.fecha = fecha;
        this.estado = estado;
    }

    /** Completa valores por defecto antes de insertar. */
    @PrePersist
    void prePersist() {
        if (fecha == null) fecha = LocalDate.now();
        if (estado == null || estado.isBlank()) estado = ESTADO_ACTIVA;
    }

    public boolean isActiva() {
        return ESTADO_ACTIVA.equals(estado);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAlumno() { return alumno; }
    public void setAlumno(String alumno) { this.alumno = alumno == null ? null : alumno.trim(); }
    public String getDni() { return dni; }
    public void setDni(String dni) { this.dni = dni == null ? null : dni.trim(); }
    public String getCurso() { return curso; }
    public void setCurso(String curso) { this.curso = curso; }
    public String getTurno() { return turno; }
    public void setTurno(String turno) { this.turno = turno; }
    public LocalDate getFecha() { return fecha; }
    public void setFecha(LocalDate fecha) { this.fecha = fecha; }
    public String getEstado() { return estado; }
    public void setEstado(String estado) { this.estado = estado; }
}
