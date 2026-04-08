import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssinaturaPlanosComponent } from './assinatura-planos.component';

describe('AssinaturaPlanosComponent', () => {
  let component: AssinaturaPlanosComponent;
  let fixture: ComponentFixture<AssinaturaPlanosComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AssinaturaPlanosComponent]
    });
    fixture = TestBed.createComponent(AssinaturaPlanosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
