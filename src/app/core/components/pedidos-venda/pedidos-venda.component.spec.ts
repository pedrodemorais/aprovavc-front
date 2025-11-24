import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PedidosVendaComponent } from './pedidos-venda.component';

describe('PedidosVendaComponent', () => {
  let component: PedidosVendaComponent;
  let fixture: ComponentFixture<PedidosVendaComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PedidosVendaComponent]
    });
    fixture = TestBed.createComponent(PedidosVendaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
