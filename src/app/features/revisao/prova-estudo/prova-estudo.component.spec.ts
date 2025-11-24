import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProvaEstudoComponent } from './prova-estudo.component';

describe('ProvaEstudoComponent', () => {
  let component: ProvaEstudoComponent;
  let fixture: ComponentFixture<ProvaEstudoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ProvaEstudoComponent]
    });
    fixture = TestBed.createComponent(ProvaEstudoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
