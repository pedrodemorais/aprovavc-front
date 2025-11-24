import { TestBed } from '@angular/core/testing';

import { ConfiguradorService } from './configurador.service';

describe('ConfiguradorService', () => {
  let service: ConfiguradorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfiguradorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
