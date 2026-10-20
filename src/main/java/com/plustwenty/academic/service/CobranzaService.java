package com.plustwenty.academic.service;
import com.plustwenty.academic.model.*;
import com.plustwenty.academic.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;
@Service
public class CobranzaService {
 private final CuotaRepository cuotas; private final PagoRepository pagos;
 public CobranzaService(CuotaRepository c,PagoRepository p){cuotas=c;pagos=p;}
 @Transactional public void generar(Matricula m,int cantidad,BigDecimal monto){
  if(cantidad<1||cantidad>12||monto==null||monto.signum()<=0||monto.scale()>2||monto.compareTo(new BigDecimal("100000"))>0)throw new IllegalArgumentException("Indique entre 1 y 12 cuotas y un monto válido con hasta dos decimales.");
  if(cuotas.existsByMatriculaId(m.getId()))throw new IllegalArgumentException("La matrícula ya tiene un cronograma.");
  for(int i=1;i<=cantidad;i++){Cuota c=new Cuota();c.setMatricula(m);c.setNumero(i);c.setMonto(monto);c.setVencimiento(m.getFecha().plusMonths(i).withDayOfMonth(1).minusDays(1));cuotas.save(c);}
 }
 @Transactional public Pago pagar(Long id,BigDecimal monto,String medio,String referencia){
  Cuota c=cuotas.findById(id).orElseThrow(()->new IllegalArgumentException("Cuota no encontrada."));
  if(!c.getMatricula().isActiva())throw new IllegalArgumentException("Reactive la matrícula antes de registrar pagos.");
  if(monto==null||monto.signum()<=0||monto.scale()>2||monto.compareTo(c.getSaldo())>0)throw new IllegalArgumentException("El pago debe ser positivo y no superar el saldo pendiente.");
  if(!List.of("Efectivo","Yape","Plin","Transferencia").contains(medio))throw new IllegalArgumentException("Seleccione un medio de pago válido.");
  if(referencia!=null&&referencia.length()>100)throw new IllegalArgumentException("La referencia admite hasta 100 caracteres.");
  if(!"Efectivo".equals(medio)&&(referencia==null||referencia.isBlank()))throw new IllegalArgumentException("Ingrese el número de operación.");
  c.setPagado(c.getPagado().add(monto));cuotas.saveAndFlush(c);
  Pago p=new Pago();p.setCuota(c);p.setMonto(monto);p.setMedio(medio);p.setReferencia(referencia);p.setFecha(LocalDateTime.now());return pagos.save(p);
 }
}
