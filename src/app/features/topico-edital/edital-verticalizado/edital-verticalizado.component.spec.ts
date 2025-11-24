import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditalVerticalizadoComponent } from './edital-verticalizado.component';

describe('EditalVerticalizadoComponent', () => {
  let component: EditalVerticalizadoComponent;
  let fixture: ComponentFixture<EditalVerticalizadoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [EditalVerticalizadoComponent]
    });
    fixture = TestBed.createComponent(EditalVerticalizadoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
