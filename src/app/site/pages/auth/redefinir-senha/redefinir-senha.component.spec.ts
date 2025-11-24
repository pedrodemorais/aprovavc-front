import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RedefinirSenhaComponent } from './redefinir-senha.component';

describe('RedefinirSenhaComponent', () => {
  let component: RedefinirSenhaComponent;
  let fixture: ComponentFixture<RedefinirSenhaComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [RedefinirSenhaComponent]
    });
    fixture = TestBed.createComponent(RedefinirSenhaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
