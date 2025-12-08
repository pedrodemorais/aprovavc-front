import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssinaturaSucessoComponent } from './assinatura-sucesso.component';

describe('AssinaturaSucessoComponent', () => {
  let component: AssinaturaSucessoComponent;
  let fixture: ComponentFixture<AssinaturaSucessoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AssinaturaSucessoComponent]
    });
    fixture = TestBed.createComponent(AssinaturaSucessoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
