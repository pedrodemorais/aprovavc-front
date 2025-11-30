import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SalaEstudoComponent } from './sala-estudo.component';

describe('SalaEstudoComponent', () => {
  let component: SalaEstudoComponent;
  let fixture: ComponentFixture<SalaEstudoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SalaEstudoComponent]
    });
    fixture = TestBed.createComponent(SalaEstudoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
