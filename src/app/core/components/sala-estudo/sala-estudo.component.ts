import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-sala-estudo',
  templateUrl: './sala-estudo.component.html',
  styleUrls: ['./sala-estudo.component.css']
})
export class SalaEstudoComponent implements OnInit {

  materiaId!: number;

  constructor(
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // tenta pegar primeiro por 'materiaId', se não achar pega 'id'
    const param =
      this.route.snapshot.paramMap.get('materiaId') ??
      this.route.snapshot.paramMap.get('id');

    this.materiaId = param ? Number(param) : 0;

    console.log('[SALA-ESTUDO] materiaId =', this.materiaId);

    // depois aqui você chama o backend:
    // this.salaEstudoService.carregarPorMateria(this.materiaId).subscribe(...)
  }
}
