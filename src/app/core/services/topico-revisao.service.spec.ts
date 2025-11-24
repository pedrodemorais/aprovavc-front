import { TestBed } from '@angular/core/testing';

import { TopicoRevisaoService } from './topico-revisao.service';

describe('TopicoRevisaoService', () => {
  let service: TopicoRevisaoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TopicoRevisaoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
