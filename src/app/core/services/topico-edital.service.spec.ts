import { TestBed } from '@angular/core/testing';

import { TopicoEditalService } from './topico-edital.service';

describe('TopicoEditalService', () => {
  let service: TopicoEditalService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TopicoEditalService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
