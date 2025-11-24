import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProdutoCadComponent } from './produto-cad.component';

describe('ProdutoCadComponent', () => {
  let component: ProdutoCadComponent;
  let fixture: ComponentFixture<ProdutoCadComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ProdutoCadComponent]
    });
    fixture = TestBed.createComponent(ProdutoCadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
