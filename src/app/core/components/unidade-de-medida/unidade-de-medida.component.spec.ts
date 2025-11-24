import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UnidadeDeMedidaComponent } from './unidade-de-medida.component';

describe('UnidadeDeMedidaComponent', () => {
  let component: UnidadeDeMedidaComponent;
  let fixture: ComponentFixture<UnidadeDeMedidaComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [UnidadeDeMedidaComponent]
    });
    fixture = TestBed.createComponent(UnidadeDeMedidaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
