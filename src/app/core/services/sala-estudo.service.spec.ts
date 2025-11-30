import { TestBed } from '@angular/core/testing';

import { SalaEstudoService } from './sala-estudo.service';

describe('SalaEstudoService', () => {
  let service: SalaEstudoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SalaEstudoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
