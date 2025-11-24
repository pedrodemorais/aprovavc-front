import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmpresaCadastroComponent } from './empresa-cadastro.component';

describe('EmpresaCadastroComponent', () => {
  let component: EmpresaCadastroComponent;
  let fixture: ComponentFixture<EmpresaCadastroComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [EmpresaCadastroComponent]
    });
    fixture = TestBed.createComponent(EmpresaCadastroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
