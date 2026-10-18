package com.plustwenty.academic.model;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;
import java.time.LocalDate;
@Entity @Getter @Setter
@Table(uniqueConstraints=@UniqueConstraint(columnNames={"matricula_id","numero"}))
public class Cuota {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(optional=false) private Matricula matricula;
 private int numero;
 private LocalDate vencimiento;
 @Column(precision=12,scale=2,nullable=false) private BigDecimal monto;
 @Column(precision=12,scale=2,nullable=false) private BigDecimal pagado=BigDecimal.ZERO;
 @Version private Long version;
 public BigDecimal getSaldo(){return monto.subtract(pagado);}
 public String getEstado(){return getSaldo().signum()==0?"PAGADA":vencimiento.isBefore(LocalDate.now())?"VENCIDA":pagado.signum()>0?"PARCIAL":"PENDIENTE";}
}
