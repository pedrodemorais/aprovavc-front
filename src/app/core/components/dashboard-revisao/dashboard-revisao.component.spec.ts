import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardRevisaoComponent } from './dashboard-revisao.component';

describe('DashboardRevisaoComponent', () => {
  let component: DashboardRevisaoComponent;
  let fixture: ComponentFixture<DashboardRevisaoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [DashboardRevisaoComponent]
    });
    fixture = TestBed.createComponent(DashboardRevisaoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
