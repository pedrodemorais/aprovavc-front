import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MateriaEstudoComponent } from './materia-estudo.component';

describe('MateriaEstudoComponent', () => {
  let component: MateriaEstudoComponent;
  let fixture: ComponentFixture<MateriaEstudoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [MateriaEstudoComponent]
    });
    fixture = TestBed.createComponent(MateriaEstudoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
