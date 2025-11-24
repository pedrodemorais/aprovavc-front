import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarcaCadastroComponent } from './marca-cadastro.component';

describe('MarcaCadastroComponent', () => {
  let component: MarcaCadastroComponent;
  let fixture: ComponentFixture<MarcaCadastroComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [MarcaCadastroComponent]
    });
    fixture = TestBed.createComponent(MarcaCadastroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
