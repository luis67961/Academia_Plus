package com.plustwenty.academic.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity @Getter @Setter
public class Solicitud {
    public enum Estado { PENDIENTE, CONFIRMADA }
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 120) private String alumno;
    @Column(nullable = false, length = 8) private String dni;
    @Column(nullable = false, length = 120) private String contacto;
    @Column(nullable = false, length = 20) private String telefono;
    @Column(nullable = false, length = 20) private String turno;
    @ManyToOne(optional = false) private Programa programa;
    @Column(nullable = false) private LocalDateTime fecha;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Estado estado = Estado.PENDIENTE;
    @OneToOne private Matricula matricula;
    @ManyToOne private Cuenta cuenta;
}
