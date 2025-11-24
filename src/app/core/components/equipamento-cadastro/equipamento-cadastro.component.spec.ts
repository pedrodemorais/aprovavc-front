import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EquipamentoCadastroComponent } from './equipamento-cadastro.component';

describe('EquipamentoCadastroComponent', () => {
  let component: EquipamentoCadastroComponent;
  let fixture: ComponentFixture<EquipamentoCadastroComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [EquipamentoCadastroComponent]
    });
    fixture = TestBed.createComponent(EquipamentoCadastroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
