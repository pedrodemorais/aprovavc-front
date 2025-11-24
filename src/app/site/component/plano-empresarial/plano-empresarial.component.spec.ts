import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlanoEmpresarialComponent } from './plano-empresarial.component';

describe('PlanoEmpresarialComponent', () => {
  let component: PlanoEmpresarialComponent;
  let fixture: ComponentFixture<PlanoEmpresarialComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PlanoEmpresarialComponent]
    });
    fixture = TestBed.createComponent(PlanoEmpresarialComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
