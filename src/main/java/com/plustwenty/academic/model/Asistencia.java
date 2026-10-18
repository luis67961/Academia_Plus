package com.plustwenty.academic.model;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDate;
@Entity @Getter @Setter @Table(uniqueConstraints=@UniqueConstraint(columnNames={"matricula_id","fecha"}))
public class Asistencia {
 public enum Estado { PRESENTE,FALTA,TARDANZA,JUSTIFICADA }
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(optional=false) private Matricula matricula;
 @Column(nullable=false) private LocalDate fecha;
 @Enumerated(EnumType.STRING) @Column(nullable=false) private Estado estado;
 private String registradoPor;
}
