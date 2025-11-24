import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlanoBasicoComponent } from './plano-basico.component';

describe('PlanoBasicoComponent', () => {
  let component: PlanoBasicoComponent;
  let fixture: ComponentFixture<PlanoBasicoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PlanoBasicoComponent]
    });
    fixture = TestBed.createComponent(PlanoBasicoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
