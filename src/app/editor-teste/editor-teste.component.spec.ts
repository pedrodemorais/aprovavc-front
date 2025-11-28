import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorTesteComponent } from './editor-teste.component';

describe('EditorTesteComponent', () => {
  let component: EditorTesteComponent;
  let fixture: ComponentFixture<EditorTesteComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [EditorTesteComponent]
    });
    fixture = TestBed.createComponent(EditorTesteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
