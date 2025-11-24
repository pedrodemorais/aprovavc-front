import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfiguracaoOsComponent } from './configuracao-os.component';

describe('ConfiguracaoOsComponent', () => {
  let component: ConfiguracaoOsComponent;
  let fixture: ComponentFixture<ConfiguracaoOsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ConfiguracaoOsComponent]
    });
    fixture = TestBed.createComponent(ConfiguracaoOsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
