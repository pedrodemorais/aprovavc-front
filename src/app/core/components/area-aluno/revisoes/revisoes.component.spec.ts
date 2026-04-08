import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { RevisoesComponent } from './revisoes.component';
import { SalaEstudoService } from '../services/sala-estudo.service';

describe('RevisoesComponent', () => {
  let component: RevisoesComponent;
  let fixture: ComponentFixture<RevisoesComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [RevisoesComponent],
      imports: [RouterTestingModule],
      providers: [
        {
          provide: SalaEstudoService,
          useValue: { listarRevisoesDashboard: () => of([]) }
        }
      ]
    });
    fixture = TestBed.createComponent(RevisoesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
