package com.plustwenty.academic.service;
import com.plustwenty.academic.model.*;
import com.plustwenty.academic.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class ProgramaService {
 private final ProgramaRepository programas;private final MatriculaRepository matriculas;
 public ProgramaService(ProgramaRepository p,MatriculaRepository m){programas=p;matriculas=m;}
 @Transactional public void guardar(Long id,Programa datos) {
  var p=id==null?new Programa():programas.findForUpdateById(id).orElseThrow(()->new IllegalArgumentException("El grupo no existe."));
  if(id!=null&&datos.getCupo()<matriculas.countByProgramaIdAndEstado(id,Matricula.ESTADO_ACTIVA))throw new IllegalArgumentException("El cupo no puede ser menor que las matrículas activas.");
  p.setNombre(datos.getNombre().trim());p.setGrupo(datos.getGrupo().trim());p.setCursos(datos.getCursos().trim());p.setHorario(datos.getHorario().trim());
  p.setDocente(datos.getDocente());p.setTurno(datos.getTurno());p.setCupo(datos.getCupo());p.setInscripcionesAbiertas(datos.isInscripcionesAbiertas());p.setCuotas(datos.getCuotas());p.setPension(datos.getPension());programas.save(p);
 }
 public long disponibles(Programa p){return Math.max(0,p.getCupo()-matriculas.countByProgramaIdAndEstado(p.getId(),Matricula.ESTADO_ACTIVA));}
}
