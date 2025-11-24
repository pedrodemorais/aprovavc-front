import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TopicoRevisaoComponent } from './topico-revisao.component';

describe('TopicoRevisaoComponent', () => {
  let component: TopicoRevisaoComponent;
  let fixture: ComponentFixture<TopicoRevisaoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TopicoRevisaoComponent]
    });
    fixture = TestBed.createComponent(TopicoRevisaoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
