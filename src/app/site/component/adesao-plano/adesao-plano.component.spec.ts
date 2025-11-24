import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdesaoPlanoComponent } from './adesao-plano.component';

describe('AdesaoPlanoComponent', () => {
  let component: AdesaoPlanoComponent;
  let fixture: ComponentFixture<AdesaoPlanoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AdesaoPlanoComponent]
    });
    fixture = TestBed.createComponent(AdesaoPlanoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
