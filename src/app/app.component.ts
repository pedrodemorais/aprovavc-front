import { Component, OnInit } from '@angular/core';
import { AuthService } from './site/services/auth.service';
import { ModoLeituraService } from './core/components/area-aluno/services/modo-leitura.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  constructor(private authService: AuthService,private modoLeitura: ModoLeituraService) {
     
    
  }

  ngOnInit() {
  this.modoLeitura.init(); 
    
  }
}
