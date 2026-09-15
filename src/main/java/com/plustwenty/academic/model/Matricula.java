package com.plustwenty.academic.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.time.LocalDate;

@Entity
public class Matricula {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String alumno;
    private String dni;
    private String curso;
    private LocalDate fecha;
    private String estado;

    public Matricula() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAlumno() { return alumno; }
    public void setAlumno(String alumno) { this.alumno = alumno; }
    public String getDni() { return dni; }
    public void setDni(String dni) { this.dni = dni; }
    public String getCurso() { return curso; }
    public void setCurso(String curso) { this.curso = curso; }
    public LocalDate getFecha() { return fecha; }
    public void setFecha(LocalDate fecha) { this.fecha = fecha; }
    public String getEstado() { return estado; }
    public void setEstado(String estado) { this.estado = estado; }
}