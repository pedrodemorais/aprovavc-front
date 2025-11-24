import { TestBed } from '@angular/core/testing';

import { MunicioService } from './municio.service';

describe('MunicioService', () => {
  let service: MunicioService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MunicioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
