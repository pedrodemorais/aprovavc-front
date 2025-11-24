import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TopicoEditalCadastroComponent } from './topico-edital-cadastro.component';

describe('TopicoEditalCadastroComponent', () => {
  let component: TopicoEditalCadastroComponent;
  let fixture: ComponentFixture<TopicoEditalCadastroComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TopicoEditalCadastroComponent]
    });
    fixture = TestBed.createComponent(TopicoEditalCadastroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
