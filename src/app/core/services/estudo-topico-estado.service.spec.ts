import { TestBed } from '@angular/core/testing';

import { EstudoTopicoEstadoService } from './estudo-topico-estado.service';

describe('EstudoTopicoEstadoService', () => {
  let service: EstudoTopicoEstadoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EstudoTopicoEstadoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
