import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MateriaCadastroComponent } from './materia-cadastro.component';

describe('MateriaCadastroComponent', () => {
  let component: MateriaCadastroComponent;
  let fixture: ComponentFixture<MateriaCadastroComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [MateriaCadastroComponent]
    });
    fixture = TestBed.createComponent(MateriaCadastroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
