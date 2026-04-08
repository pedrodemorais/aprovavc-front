import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RedefinirSenhaSiteComponent } from './redefinir-senha-site.component';

describe('RedefinirSenhaSiteComponent', () => {
  let component: RedefinirSenhaSiteComponent;
  let fixture: ComponentFixture<RedefinirSenhaSiteComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [RedefinirSenhaSiteComponent]
    });
    fixture = TestBed.createComponent(RedefinirSenhaSiteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
