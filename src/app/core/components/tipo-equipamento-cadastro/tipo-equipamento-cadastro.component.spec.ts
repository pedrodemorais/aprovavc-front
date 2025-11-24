import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TipoEquipamentoCadastroComponent } from './tipo-equipamento-cadastro.component';

describe('TipoEquipamentoCadastroComponent', () => {
  let component: TipoEquipamentoCadastroComponent;
  let fixture: ComponentFixture<TipoEquipamentoCadastroComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TipoEquipamentoCadastroComponent]
    });
    fixture = TestBed.createComponent(TipoEquipamentoCadastroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
