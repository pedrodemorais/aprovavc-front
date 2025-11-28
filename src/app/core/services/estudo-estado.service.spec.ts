import { TestBed } from '@angular/core/testing';

import { EstudoEstadoService } from './estudo-estado.service';

describe('EstudoEstadoService', () => {
  let service: EstudoEstadoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EstudoEstadoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
