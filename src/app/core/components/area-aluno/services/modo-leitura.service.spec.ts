import { TestBed } from '@angular/core/testing';

import { ModoLeituraService } from './modo-leitura.service';

describe('ModoLeituraService', () => {
  let service: ModoLeituraService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ModoLeituraService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
