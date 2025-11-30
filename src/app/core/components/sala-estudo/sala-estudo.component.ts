import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-sala-estudo',
  templateUrl: './sala-estudo.component.html',
  styleUrls: ['./sala-estudo.component.css']
})
export class SalaEstudoComponent implements OnInit {

  topicoId!: number;

  constructor(
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const param = this.route.snapshot.paramMap.get('topicoId');
    this.topicoId = param ? Number(param) : 0;

    // aqui depois a gente chama o backend:
    // this.salaEstudoService.carregarPorTopico(this.topicoId)...
  }
}
