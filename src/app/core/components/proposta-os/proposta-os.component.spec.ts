import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PropostaOsComponent } from './proposta-os.component';

describe('PropostaOsComponent', () => {
  let component: PropostaOsComponent;
  let fixture: ComponentFixture<PropostaOsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PropostaOsComponent]
    });
    fixture = TestBed.createComponent(PropostaOsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
