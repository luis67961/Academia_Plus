package com.plustwenty.academic.model;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;
import java.time.LocalDateTime;
@Entity @Getter @Setter @Table(uniqueConstraints=@UniqueConstraint(columnNames={"medio","referencia"}))
public class Comprobante {
 public enum Estado{PENDIENTE,APROBADO,RECHAZADO}
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(optional=false) private Cuota cuota;
 @ManyToOne(optional=false) private Cuenta cuenta;
 @Column(nullable=false,precision=12,scale=2) private BigDecimal monto;
 @Column(nullable=false) private String medio;
 @Column(nullable=false,length=100) private String referencia;
 private String tipo;
 @Lob @Column(nullable=false) private byte[] archivo;
 private LocalDateTime fecha;
 @Enumerated(EnumType.STRING) private Estado estado=Estado.PENDIENTE;
 @Column(length=500) private String motivo;
 private String revisadoPor;
 private LocalDateTime revisadoEn;
 @OneToOne private Pago pago;
}
