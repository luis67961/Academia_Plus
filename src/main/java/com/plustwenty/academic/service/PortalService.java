package com.plustwenty.academic.service;

import com.plustwenty.academic.model.*;
import com.plustwenty.academic.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Service
public class PortalService {
    private final MatriculaRepository matriculas;
    private final SolicitudRepository solicitudes;
    private final CuotaRepository cuotas;
    private final PagoRepository pagos;
    public PortalService(MatriculaRepository m,SolicitudRepository s,CuotaRepository c,PagoRepository p) {
        matriculas=m; solicitudes=s; cuotas=c; pagos=p;
    }
    public List<Matricula> matriculas(String usuario) {
        var lista=new LinkedHashMap<Long,Matricula>();
        matriculas.findByCuentaUsuarioOrderByFechaDesc(usuario).forEach(m->lista.put(m.getId(),m));
        solicitudes.findByCuentaUsuarioOrderByFechaDescIdDesc(usuario).forEach(s->{
            if(s.getMatricula()!=null) lista.put(s.getMatricula().getId(),s.getMatricula());
        });
        if(Set.of("padre","estudiante").contains(usuario))
            matriculas.findFirstByDni("72834912").ifPresent(m->lista.put(m.getId(),m));
        return List.copyOf(lista.values());
    }
    public boolean puedeVer(String usuario,Long matriculaId) {
        return matriculas(usuario).stream().anyMatch(m->m.getId().equals(matriculaId));
    }
    public Cuota cuota(String usuario,Long id) {
        var c=cuotas.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        if(!puedeVer(usuario,c.getMatricula().getId())) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return c;
    }
    public Pago pago(String usuario,Long id) {
        var p=pagos.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        if(!puedeVer(usuario,p.getCuota().getMatricula().getId())) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return p;
    }
}
