package com.plustwenty.academic;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Value;
import java.net.*;
import java.net.http.*;
import java.util.regex.Pattern;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties="spring.datasource.url=jdbc:h2:mem:acceso-web")
class AccesoWebTests {
 @org.springframework.beans.factory.annotation.Autowired com.plustwenty.academic.repository.SolicitudRepository solicitudes;
 @org.springframework.beans.factory.annotation.Autowired com.plustwenty.academic.repository.MatriculaRepository matriculas;
 @org.springframework.beans.factory.annotation.Autowired com.plustwenty.academic.repository.CuotaRepository cuotas;
 @org.springframework.beans.factory.annotation.Autowired com.plustwenty.academic.repository.ProgramaRepository programas;
 @org.springframework.beans.factory.annotation.Autowired com.plustwenty.academic.repository.CuentaRepository cuentas;
 @org.springframework.beans.factory.annotation.Autowired com.plustwenty.academic.repository.ComprobanteRepository comprobantes;
 @org.springframework.beans.factory.annotation.Autowired org.springframework.security.crypto.password.PasswordEncoder encoder;
 @Value("${local.server.port}") int port;
 private HttpClient cliente(){return HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();}
 private HttpResponse<String> get(HttpClient c,String ruta)throws Exception{return c.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+ruta)).GET().build(),HttpResponse.BodyHandlers.ofString());}
 private HttpResponse<String> post(HttpClient c,String ruta,String datos)throws Exception{return c.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+ruta)).header("Content-Type","application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(datos)).build(),HttpResponse.BodyHandlers.ofString());}
 private void login(HttpClient c,String usuario,String clave)throws Exception{
  String html=get(c,"/login").body();var token=Pattern.compile("name=\"_csrf\"[^>]*value=\"([^\"]+)\"").matcher(html);assertTrue(token.find());
  var r=post(c,"/login","username="+usuario+"&password="+URLEncoder.encode(clave,java.nio.charset.StandardCharsets.UTF_8)+"&_csrf="+URLEncoder.encode(token.group(1),java.nio.charset.StandardCharsets.UTF_8));
  assertEquals(302,r.statusCode());assertFalse(r.headers().firstValue("Location").orElse("").contains("error"));
 }
 @Test void administradorRenderizaPantallasYRequiereCsrf()throws Exception{
  var c=cliente();assertEquals(302,get(c,"/matriculas").statusCode());login(c,"admin","DemoAdmin2026!");
  assertEquals(200,get(cliente(),"/js/interfaz.js").statusCode());
  assertTrue(get(c,"/inscripcion?programaId=1").body().contains("Estás usando la cuenta de administración."));
  for(String ruta:new String[]{"/dashboard","/matriculas","/matriculas/nuevo","/programas","/programas/1/editar","/asistencia?programaId=1","/estudiantes","/estudiantes/72834912","/perfil","/pensiones","/pensiones?id=1","/solicitudes","/comprobantes"}){var r=get(c,ruta);assertEquals(200,r.statusCode(),ruta);assertFalse(r.body().contains("Oops"),ruta);}
  assertEquals(403,post(c,"/pensiones/pagar","cuotaId=1&monto=1&medio=Efectivo").statusCode());
 }
 @Test void familiasConsultanSoloSuAlumnoYNoAdministran()throws Exception{
  for(String usuario:new String[]{"padre","estudiante"}){
   var c=cliente();login(c,usuario,usuario.equals("padre")?"DemoFamilia2026!":"DemoAlumno2026!");
   var r=get(c,"/portal");assertEquals(200,r.statusCode());assertTrue(r.body().contains("María Fernández"));assertFalse(r.body().contains("Juan Pérez"));
   assertEquals(403,get(c,"/pensiones").statusCode());assertEquals(403,get(c,"/matriculas").statusCode());assertEquals(403,get(c,"/programas").statusCode());
   assertEquals(403,get(c,"/solicitudes").statusCode());
  }
 }
 private String csrf(String html) {
  var token=Pattern.compile("name=\"_csrf\"[^>]*value=\"([^\"]+)\"").matcher(html);
  assertTrue(token.find());return URLEncoder.encode(token.group(1),java.nio.charset.StandardCharsets.UTF_8);
 }
 @Test void perfilEditaSoloCuentaPropiaYCambiaClave()throws Exception {
  var cuenta=new com.plustwenty.academic.model.Cuenta();cuenta.setUsuario("perfil.prueba");cuenta.setClaveHash(encoder.encode("Original2026!"));cuenta.setRol("ESTUDIANTE");cuentas.save(cuenta);
  var c=cliente();login(c,"perfil.prueba","Original2026!");
  String html=get(c,"/perfil").body();assertTrue(html.contains("Mis datos."));
  assertEquals(302,post(c,"/perfil","nombre=Contacto+Prueba&telefono=999888777&email=perfil%40example.com&_csrf="+csrf(html)).statusCode());
  assertEquals("Contacto Prueba",cuentas.findByUsuario("perfil.prueba").orElseThrow().getNombre());
  var porCorreo=cliente();login(porCorreo,"PERFIL%40EXAMPLE.COM","Original2026!");
  assertTrue(get(porCorreo,"/perfil").body().contains("perfil.prueba"));
  var incorrecta=cliente();
  var rechazo=post(incorrecta,"/login","username=perfil%40example.com&password=Incorrecta&_csrf="+csrf(get(incorrecta,"/login").body()));
  assertTrue(rechazo.headers().firstValue("Location").orElse("").contains("error"));
  assertEquals(302,post(c,"/perfil/clave","actual=Incorrecta&nueva=NuevaSegura2026!&repetir=NuevaSegura2026!&_csrf="+csrf(get(c,"/perfil").body())).statusCode());
  assertTrue(encoder.matches("Original2026!",cuentas.findByUsuario("perfil.prueba").orElseThrow().getClaveHash()));
  var r=post(c,"/perfil/clave","actual=Original2026!&nueva=NuevaSegura2026!&repetir=NuevaSegura2026!&_csrf="+csrf(get(c,"/perfil").body()));
  assertEquals(302,r.statusCode());assertTrue(r.headers().firstValue("Location").orElse("").contains("claveActualizada"));
  assertEquals(302,get(c,"/perfil").statusCode());login(cliente(),"perfil.prueba","NuevaSegura2026!");
 }
 @Test void correoDuplicadoNoPuedeUsarseParaAcceder()throws Exception {
  for(String usuario:new String[]{"duplicado.uno","duplicado.dos"}) {
   var cuenta=new com.plustwenty.academic.model.Cuenta();cuenta.setUsuario(usuario);
   cuenta.setEmail("duplicado@example.com");cuenta.setClaveHash(encoder.encode("Duplicado2026!"));
   cuenta.setRol("ESTUDIANTE");cuentas.save(cuenta);
  }
  var c=cliente();
  var respuesta=post(c,"/login","username=duplicado%40example.com&password=Duplicado2026!&_csrf="+csrf(get(c,"/login").body()));
  assertTrue(respuesta.headers().firstValue("Location").orElse("").contains("error"));
  login(c,"duplicado.uno","Duplicado2026!");
  var html=get(c,"/perfil").body();
  var duplicado=post(c,"/perfil","nombre=Prueba&telefono=999888777&email=duplicado%40example.com&_csrf="+csrf(html));
  assertEquals(200,duplicado.statusCode());assertTrue(duplicado.body().contains("Este correo ya está asociado"));
 }
 @Test void solicitudPublicaSeConfirmaUnaSolaVezYGeneraCuotas()throws Exception {
  var publico=cliente();
  for(String ruta:new String[]{"/","/cursos","/inscripcion","/inscripcion/recibida"}) assertEquals(200,get(publico,ruta).statusCode(),ruta);
  assertEquals(302,get(publico,"/solicitudes").statusCode());
  assertEquals(403,post(publico,"/inscripcion","alumno=Prueba").statusCode());
  var p=programas.findAll().getFirst();
  long antes=matriculas.count(), cuotasAntes=cuotas.count(), solicitudesAntes=solicitudes.count();
  String token=csrf(get(publico,"/inscripcion").body());
  String datos="alumno=Estudiante+Solicitud&dni=90909090&contacto=Apoderado+Prueba&telefono=999888777&turno="+URLEncoder.encode("Mañana",java.nio.charset.StandardCharsets.UTF_8)+"&programaId="+p.getId()+"&aceptaContacto=true&usuario=alumno.nuevo&clave=PruebaAlumno2026!&repetirClave=PruebaAlumno2026!&_csrf="+token;
  var invalido=post(publico,"/inscripcion",datos.replace("dni=90909090","dni=abc"));
  assertEquals(200,invalido.statusCode());assertTrue(invalido.body().contains("El DNI debe tener 8"));
  assertEquals(solicitudesAntes,solicitudes.count());
  var sinConsentimiento=post(publico,"/inscripcion",datos.replace("aceptaContacto=true","aceptaContacto=false"));
  assertEquals(200,sinConsentimiento.statusCode());assertEquals(solicitudesAntes,solicitudes.count());
  assertEquals(200,post(publico,"/inscripcion",datos.replace("repetirClave=PruebaAlumno2026!","repetirClave=NoCoincide2026!")).statusCode());
  assertFalse(cuentas.existsByUsuario("alumno.nuevo"));assertEquals(solicitudesAntes,solicitudes.count());
  assertEquals(200,post(publico,"/inscripcion",datos.replace("clave=PruebaAlumno2026!","clave=corta")).statusCode());
  assertFalse(cuentas.existsByUsuario("alumno.nuevo"));
  var enviada=post(publico,"/inscripcion",datos);assertEquals(302,enviada.statusCode());
  assertTrue(enviada.headers().firstValue("Location").orElse("").endsWith("/inscripcion/recibida"));
  assertEquals(antes,matriculas.count());assertEquals(cuotasAntes,cuotas.count());
  assertEquals(solicitudesAntes+1,solicitudes.count());
  assertEquals(200,post(publico,"/inscripcion",datos).statusCode());assertEquals(solicitudesAntes+1,solicitudes.count());
  var solicitud=solicitudes.findAllByOrderByFechaDescIdDesc().getFirst();
  assertEquals(com.plustwenty.academic.model.Solicitud.Estado.PENDIENTE,solicitud.getEstado());
  var cuenta=cuentas.findByUsuario("alumno.nuevo").orElseThrow();
  assertNotEquals("PruebaAlumno2026!",cuenta.getClaveHash());assertTrue(encoder.matches("PruebaAlumno2026!",cuenta.getClaveHash()));
  assertEquals(cuenta.getId(),solicitud.getCuenta().getId());
  var alumno=cliente();login(alumno,"ALUMNO.NUEVO","PruebaAlumno2026!");
  String pendiente=get(alumno,"/portal").body();assertTrue(pendiente.contains("Estudiante Solicitud"));
  assertTrue(pendiente.contains("Pendiente de revisión"));assertFalse(pendiente.contains("María Fernández"));
  assertFalse(pendiente.contains("Mis pensiones"));assertEquals(403,get(alumno,"/solicitudes").statusCode());
  assertEquals(200,get(alumno,"/portal/solicitudes/"+solicitud.getId()).statusCode());
  assertEquals(302,post(publico,"/solicitudes/"+solicitud.getId()+"/confirmar","_csrf="+token).statusCode());
  var admin=cliente();login(admin,"admin","DemoAdmin2026!");
  String html=get(admin,"/solicitudes").body();assertTrue(html.contains("Estudiante Solicitud"));
  assertEquals(302,post(admin,"/solicitudes/"+solicitud.getId()+"/confirmar","_csrf="+csrf(html)).statusCode());
  var confirmada=solicitudes.findById(solicitud.getId()).orElseThrow();
  assertEquals(com.plustwenty.academic.model.Solicitud.Estado.CONFIRMADA,confirmada.getEstado());
  assertEquals(antes+1,matriculas.count());
  var cronograma=cuotas.findByMatriculaIdOrderByNumero(confirmada.getMatricula().getId());
  assertEquals(p.getCuotas(),cronograma.size());assertEquals(0,p.getPension().compareTo(cronograma.getFirst().getMonto()));
  String portal=get(alumno,"/portal").body();assertTrue(portal.contains("Matrícula confirmada"));assertTrue(portal.contains("Mis pensiones"));assertFalse(portal.contains("María Fernández"));
  assertEquals(200,get(alumno,"/portal/comprobantes/nuevo?cuotaId="+cronograma.getFirst().getId()).statusCode());
  var enviadaArchivo=enviarArchivo(alumno,cronograma.getFirst().getId(),get(alumno,"/portal/comprobantes/nuevo?cuotaId="+cronograma.getFirst().getId()).body());assertEquals(302,enviadaArchivo.statusCode());
  assertTrue(get(alumno,"/portal").body().contains("WEB-OPERACION"));
  var comprobante=comprobantes.findAllByOrderByFechaDesc().getFirst();
  assertEquals(200,get(admin,"/comprobantes").statusCode());assertEquals(200,get(alumno,"/portal/comprobantes/"+comprobante.getId()+"/archivo").statusCode());
  assertEquals(302,post(admin,"/comprobantes/"+comprobante.getId()+"/revisar","aprobar=true&_csrf="+csrf(get(admin,"/comprobantes").body())).statusCode());
  var pago=comprobantes.findById(comprobante.getId()).orElseThrow().getPago();assertNotNull(pago);
  assertEquals(200,get(alumno,"/portal/constancias/"+pago.getId()).statusCode());
  var descarga=get(alumno,"/portal/constancias/"+pago.getId()+"?descargar=true");assertEquals(200,descarga.statusCode());assertTrue(descarga.headers().firstValue("Content-Disposition").orElse("").contains("attachment"));
  var otraSesion=cliente();login(otraSesion,"alumno.nuevo","PruebaAlumno2026!");assertTrue(get(otraSesion,"/portal").body().contains("Mis pensiones"));
  assertEquals(302,post(admin,"/solicitudes/"+solicitud.getId()+"/confirmar","_csrf="+csrf(get(admin,"/solicitudes").body())).statusCode());
  assertEquals(antes+1,matriculas.count());assertEquals(cuotasAntes+p.getCuotas(),cuotas.count());
  var segundo=cliente();String token2=csrf(get(segundo,"/inscripcion").body());
  String datos2=datos.replace("Estudiante+Solicitud","Otro+Estudiante").replace("90909090","90909091").replace("alumno.nuevo","alumno.otro").replace(token,token2);
  assertEquals(302,post(segundo,"/inscripcion",datos2).statusCode());login(segundo,"alumno.otro","PruebaAlumno2026!");
  String ajeno=get(segundo,"/portal").body();assertTrue(ajeno.contains("Otro Estudiante"));assertFalse(ajeno.contains("Estudiante Solicitud"));assertFalse(ajeno.contains("Mis pensiones"));
  assertEquals(404,get(segundo,"/portal/solicitudes/"+solicitud.getId()).statusCode());
  assertEquals(404,get(segundo,"/portal/comprobantes/nuevo?cuotaId="+cronograma.getFirst().getId()).statusCode());
  assertEquals(404,get(segundo,"/portal/comprobantes/"+comprobante.getId()+"/archivo").statusCode());assertEquals(404,get(segundo,"/portal/constancias/"+pago.getId()).statusCode());
  String segundaSolicitud=datos2.replace("programaId="+p.getId(),"programaId="+programas.findAll().get(1).getId()).replace(token2,csrf(get(segundo,"/inscripcion").body()));
  assertEquals(302,post(segundo,"/inscripcion",segundaSolicitud).statusCode());
  assertEquals(2,solicitudes.findByCuentaUsuarioOrderByFechaDescIdDesc("alumno.otro").size());
 }
 private HttpResponse<String> enviarArchivo(HttpClient cliente,Long cuotaId,String html)throws Exception{
  String boundary="AcademiaBoundary2026";var out=new java.io.ByteArrayOutputStream();
  var campos=java.util.Map.of("cuotaId",cuotaId.toString(),"monto","10.00","medio","Yape","referencia","WEB-OPERACION","_csrf",URLDecoder.decode(csrf(html),java.nio.charset.StandardCharsets.UTF_8));
  for(var e:campos.entrySet())out.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\""+e.getKey()+"\"\r\n\r\n"+e.getValue()+"\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
  out.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"archivo\"; filename=\"pago.pdf\"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 prueba\r\n--"+boundary+"--\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
  return cliente.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/portal/comprobantes")).header("Content-Type","multipart/form-data; boundary="+boundary).POST(HttpRequest.BodyPublishers.ofByteArray(out.toByteArray())).build(),HttpResponse.BodyHandlers.ofString());
 }
}
