import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssinaturaCanceladaComponent } from './assinatura-cancelada.component';

describe('AssinaturaCanceladaComponent', () => {
  let component: AssinaturaCanceladaComponent;
  let fixture: ComponentFixture<AssinaturaCanceladaComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AssinaturaCanceladaComponent]
    });
    fixture = TestBed.createComponent(AssinaturaCanceladaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
