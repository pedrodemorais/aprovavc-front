import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssineComponent } from './assine.component';

describe('AssineComponent', () => {
  let component: AssineComponent;
  let fixture: ComponentFixture<AssineComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AssineComponent]
    });
    fixture = TestBed.createComponent(AssineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
