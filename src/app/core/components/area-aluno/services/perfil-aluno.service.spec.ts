import { TestBed } from '@angular/core/testing';

import { PerfilAlunoService } from './perfil-aluno.service';

describe('PerfilAlunoService', () => {
  let service: PerfilAlunoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PerfilAlunoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
