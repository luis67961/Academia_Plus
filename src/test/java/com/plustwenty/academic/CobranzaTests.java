package com.plustwenty.academic;
import com.plustwenty.academic.model.*;
import com.plustwenty.academic.repository.*;
import com.plustwenty.academic.service.CobranzaService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:cobranza-tests")
@Transactional
class CobranzaTests {
 @Autowired CobranzaService service;
 @Autowired MatriculaRepository matriculas;
 @Autowired CuotaRepository cuotas;
 @Autowired PagoRepository pagos;
 private Matricula nueva(){return matriculas.save(new Matricula("Estudiante de prueba","90123456","Podcast","Tarde",LocalDate.of(2026,1,31),"ACTIVA"));}
 @Test void generaYAbonaSinPerderHistorial(){
  var m=nueva();service.generar(m,3,new BigDecimal("350.00"));var lista=cuotas.findByMatriculaIdOrderByNumero(m.getId());
  assertEquals(3,lista.size());assertEquals(LocalDate.of(2026,2,28),lista.get(1).getVencimiento());
  var c=lista.getFirst();service.pagar(c.getId(),new BigDecimal("100.00"),"Yape","OP-TEST-001");
  assertEquals(0,cuotas.findById(c.getId()).orElseThrow().getSaldo().compareTo(new BigDecimal("250.00")));
  service.pagar(c.getId(),new BigDecimal("250.00"),"Efectivo","");
  assertEquals("PAGADA",cuotas.findById(c.getId()).orElseThrow().getEstado());
  assertEquals(2,pagos.findByCuotaMatriculaIdOrderByFechaDesc(m.getId()).size());
 }
 @Test void rechazaSobrepagoDuplicadosYMontosInvalidos(){
  var m=nueva();service.generar(m,1,new BigDecimal("350.00"));var c=cuotas.findByMatriculaIdOrderByNumero(m.getId()).getFirst();
  assertThrows(IllegalArgumentException.class,()->service.generar(m,1,new BigDecimal("350.00")));
  assertThrows(IllegalArgumentException.class,()->service.pagar(c.getId(),new BigDecimal("351"),"Efectivo",""));
  assertThrows(IllegalArgumentException.class,()->service.pagar(c.getId(),BigDecimal.ZERO,"Efectivo",""));
  assertThrows(IllegalArgumentException.class,()->service.pagar(c.getId(),new BigDecimal("1.001"),"Efectivo",""));
  assertThrows(IllegalArgumentException.class,()->service.pagar(c.getId(),BigDecimal.ONE,"Yape",""));
  assertEquals(0,c.getPagado().signum());
 }
}
