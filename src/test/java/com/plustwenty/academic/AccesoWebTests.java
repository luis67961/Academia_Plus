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
  for(String ruta:new String[]{"/dashboard","/matriculas","/matriculas/nuevo","/programas","/pensiones","/pensiones?id=1","/solicitudes"}){var r=get(c,ruta);assertEquals(200,r.statusCode(),ruta);assertFalse(r.body().contains("Oops"),ruta);}
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
  assertEquals(302,post(c,"/perfil/clave","actual=Incorrecta&nueva=NuevaSegura2026!&repetir=NuevaSegura2026!&_csrf="+csrf(get(c,"/perfil").body())).statusCode());
  assertTrue(encoder.matches("Original2026!",cuentas.findByUsuario("perfil.prueba").orElseThrow().getClaveHash()));
  var r=post(c,"/perfil/clave","actual=Original2026!&nueva=NuevaSegura2026!&repetir=NuevaSegura2026!&_csrf="+csrf(get(c,"/perfil").body()));
  assertEquals(302,r.statusCode());assertTrue(r.headers().firstValue("Location").orElse("").contains("claveActualizada"));
  assertEquals(302,get(c,"/perfil").statusCode());login(cliente(),"perfil.prueba","NuevaSegura2026!");
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
  var otraSesion=cliente();login(otraSesion,"alumno.nuevo","PruebaAlumno2026!");assertTrue(get(otraSesion,"/portal").body().contains("Mis pensiones"));
  assertEquals(302,post(admin,"/solicitudes/"+solicitud.getId()+"/confirmar","_csrf="+csrf(get(admin,"/solicitudes").body())).statusCode());
  assertEquals(antes+1,matriculas.count());assertEquals(cuotasAntes+p.getCuotas(),cuotas.count());
  var segundo=cliente();String token2=csrf(get(segundo,"/inscripcion").body());
  String datos2=datos.replace("Estudiante+Solicitud","Otro+Estudiante").replace("90909090","90909091").replace("alumno.nuevo","alumno.otro").replace(token,token2);
  assertEquals(302,post(segundo,"/inscripcion",datos2).statusCode());login(segundo,"alumno.otro","PruebaAlumno2026!");
  String ajeno=get(segundo,"/portal").body();assertTrue(ajeno.contains("Otro Estudiante"));assertFalse(ajeno.contains("Estudiante Solicitud"));assertFalse(ajeno.contains("Mis pensiones"));
  String segundaSolicitud=datos2.replace("programaId="+p.getId(),"programaId="+programas.findAll().get(1).getId()).replace(token2,csrf(get(segundo,"/inscripcion").body()));
  assertEquals(302,post(segundo,"/inscripcion",segundaSolicitud).statusCode());
  assertEquals(2,solicitudes.findByCuentaUsuarioOrderByFechaDescIdDesc("alumno.otro").size());
 }
}
