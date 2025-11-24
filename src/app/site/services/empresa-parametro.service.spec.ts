import { TestBed } from '@angular/core/testing';

import { EmpresaParametroService } from './empresa-parametro.service';

describe('EmpresaParametroService', () => {
  let service: EmpresaParametroService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EmpresaParametroService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
