import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AtivacaoComponent } from './ativacao.component';

describe('AtivacaoComponent', () => {
  let component: AtivacaoComponent;
  let fixture: ComponentFixture<AtivacaoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AtivacaoComponent]
    });
    fixture = TestBed.createComponent(AtivacaoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
