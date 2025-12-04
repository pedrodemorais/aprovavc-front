import { TestBed } from '@angular/core/testing';

import { EditalService } from './edital.service';

describe('EditalService', () => {
  let service: EditalService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditalService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
