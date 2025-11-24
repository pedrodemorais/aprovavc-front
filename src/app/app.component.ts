import { Component, OnInit } from '@angular/core';
import { AuthService } from './site/services/auth.service';
import { SwUpdate } from '@angular/service-worker';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  constructor(private authService: AuthService,private swUpdate: SwUpdate) {
     this.swUpdate.versionUpdates.subscribe(() => {
        console.log('Nova versão detectada! Atualizando...');
        this.swUpdate.activateUpdate().then(() => document.location.reload());
      });
    
  }

  ngOnInit() {
 
    
  }
}
