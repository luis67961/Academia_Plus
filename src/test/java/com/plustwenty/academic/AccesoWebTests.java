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
  for(String ruta:new String[]{"/dashboard","/matriculas","/matriculas/nuevo","/programas","/pensiones","/pensiones?id=1"}){var r=get(c,ruta);assertEquals(200,r.statusCode(),ruta);assertFalse(r.body().contains("Oops"),ruta);}
  assertEquals(403,post(c,"/pensiones/pagar","cuotaId=1&monto=1&medio=Efectivo").statusCode());
 }
 @Test void familiasConsultanSoloSuAlumnoYNoAdministran()throws Exception{
  for(String usuario:new String[]{"padre","estudiante"}){
   var c=cliente();login(c,usuario,usuario.equals("padre")?"DemoFamilia2026!":"DemoAlumno2026!");
   var r=get(c,"/portal");assertEquals(200,r.statusCode());assertTrue(r.body().contains("María Fernández"));assertFalse(r.body().contains("Juan Pérez"));
   assertEquals(403,get(c,"/pensiones").statusCode());assertEquals(403,get(c,"/matriculas").statusCode());assertEquals(403,get(c,"/programas").statusCode());
  }
 }
}
