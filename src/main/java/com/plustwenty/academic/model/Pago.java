package com.plustwenty.academic.model;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;
import java.time.LocalDateTime;
@Entity @Getter @Setter
public class Pago {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(optional=false) private Cuota cuota;
 @Column(precision=12,scale=2,nullable=false) private BigDecimal monto;
 private String medio;
 private String referencia;
 private LocalDateTime fecha;
 @Column(unique=true,length=140) private String claveOperacion;
 private String registradoPor;
}
