package com.plustwenty.academic.model;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;
@Entity @Getter @Setter
public class Programa {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @NotBlank @Size(max=100) private String nombre;
 @NotBlank @Size(max=80) private String grupo;
 @NotBlank @Size(max=500) @Column(length=500) private String cursos;
 @NotBlank @Size(max=160) private String horario;
 @Min(1) @Max(12) private int cuotas=3;
 @NotNull @DecimalMin("1.00") @DecimalMax("100000.00") @Digits(integer=6,fraction=2) private BigDecimal pension=new BigDecimal("350.00");
}
