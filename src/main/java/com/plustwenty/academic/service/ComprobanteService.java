package com.plustwenty.academic.service;
import com.plustwenty.academic.model.*;
import com.plustwenty.academic.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
@Service
public class ComprobanteService {
 private final ComprobanteRepository comprobantes;private final CuentaRepository cuentas;private final PortalService acceso;private final CobranzaService cobranza;
 public ComprobanteService(ComprobanteRepository c,CuentaRepository a,PortalService p,CobranzaService s){comprobantes=c;cuentas=a;acceso=p;cobranza=s;}
 @Transactional public void enviar(String usuario,Long cuotaId,BigDecimal monto,String medio,String referencia,byte[] archivo){
  var cuota=acceso.cuota(usuario,cuotaId);
  if(!cuota.getMatricula().isActiva())throw new IllegalArgumentException("La matrícula está inactiva. Comunícate con administración.");
  if(monto==null||monto.signum()<=0||monto.scale()>2||monto.compareTo(cuota.getSaldo())>0)throw new IllegalArgumentException("Indica un monto positivo que no supere el saldo de la cuota.");
  if(!List.of("Yape","Plin","Transferencia").contains(medio))throw new IllegalArgumentException("Selecciona un medio válido.");
  if(referencia==null||referencia.isBlank()||referencia.length()>100)throw new IllegalArgumentException("Indica el número de operación (hasta 100 caracteres).");
  if(archivo==null||archivo.length<8||archivo.length>5*1024*1024)throw new IllegalArgumentException("Adjunta un archivo PNG, JPG o PDF de hasta 5 MB.");
  String tipo;
  if(archivo[0]==(byte)0x89&&archivo[1]=='P'&&archivo[2]=='N'&&archivo[3]=='G'&&archivo[4]==13&&archivo[5]==10&&archivo[6]==26&&archivo[7]==10)tipo="image/png";
  else if(archivo[0]==(byte)0xff&&archivo[1]==(byte)0xd8&&archivo[2]==(byte)0xff)tipo="image/jpeg";
  else if(archivo[0]=='%'&&archivo[1]=='P'&&archivo[2]=='D'&&archivo[3]=='F'&&archivo[4]=='-')tipo="application/pdf";
  else throw new IllegalArgumentException("El archivo debe ser PNG, JPG o PDF.");
  var c=new Comprobante();c.setCuota(cuota);c.setCuenta(cuentas.findByUsuario(usuario).orElseThrow());c.setMonto(monto);c.setMedio(medio);c.setReferencia(referencia.trim().toUpperCase(java.util.Locale.ROOT));c.setArchivo(archivo);c.setTipo(tipo);c.setFecha(LocalDateTime.now());comprobantes.saveAndFlush(c);
 }
 @Transactional public void revisar(Long id,boolean aprobar,String motivo,String actor){
  var c=comprobantes.findForUpdateById(id).orElseThrow(()->new IllegalArgumentException("Comprobante no encontrado."));
  if(c.getEstado()!=Comprobante.Estado.PENDIENTE)throw new IllegalArgumentException("Este comprobante ya fue revisado.");
  if(!aprobar&&(motivo==null||motivo.isBlank()||motivo.length()>500))throw new IllegalArgumentException("Indica el motivo del rechazo (hasta 500 caracteres).");
  if(aprobar)c.setPago(cobranza.pagar(c.getCuota().getId(),c.getMonto(),c.getMedio(),c.getReferencia()));
  c.setEstado(aprobar?Comprobante.Estado.APROBADO:Comprobante.Estado.RECHAZADO);c.setMotivo(aprobar?"Operación verificada por administración.":motivo.trim());c.setRevisadoPor(actor);c.setRevisadoEn(LocalDateTime.now());
 }
}
