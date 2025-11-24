import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-planner',
  templateUrl: './planner.component.html',
  styleUrls: ['./planner.component.css']
})
export class PlannerComponent implements OnInit {
  displayedColumns: string[] = ['dia', 'eventos'];
  dias: { data: Date; eventos: any[] }[] = [];
  mesAtual: Date = new Date(); // Armazena o mês atual

  constructor() {}

  ngOnInit(): void {
    this.gerarDiasDoMes();
  }

  // gerarDiasDoMes(): void {
  //   this.dias = []; // Limpa a lista de dias antes de gerar novamente
  //   const ano = this.mesAtual.getFullYear();
  //   const mes = this.mesAtual.getMonth();
  //   const primeiroDia = new Date(ano, mes, 1);
  //   const ultimoDia = new Date(ano, mes + 1, 0);

  //   for (let dia = primeiroDia; dia <= ultimoDia; dia.setDate(dia.getDate() + 1)) {
  //     this.dias.push({
  //       data: new Date(dia),
  //       eventos: this.obterEventos(new Date(dia))
  //     });
  //   }
  // }

  gerarDiasDoMes(): void {
    this.dias = []; // Limpa a lista de dias antes de gerar novamente
    const primeiroDia = new Date(this.mesAtual); // Começa com o mês atual
    const ultimoDia = new Date(primeiroDia);
    ultimoDia.setDate(primeiroDia.getDate() + 29); // Limite de 30 dias
  
    for (let dia = new Date(primeiroDia); dia <= ultimoDia; dia.setDate(dia.getDate() + 1)) {
      this.dias.push({
        data: new Date(dia),
        eventos: this.obterEventos(new Date(dia))
      });
    }
  
    // Atualiza o mês do título para refletir o primeiro dia do intervalo
    this.mesAtual = new Date(primeiroDia);
  }
  
  

  obterEventos(data: Date): any[] {
    const eventos = [
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 10 peças', data: new Date(2025, 0, 20) },
      { title: 'Entrega: 5 caixas decorativas', data: new Date(2025, 0, 25) }
    ];

    return eventos.filter(evento => 
      evento.data.toDateString() === data.toDateString()
    );
  }

  // navegarMes(direcao: number): void {
  //   // Altera o mês atual com base na direção (-1 para anterior, +1 para próximo)
  //   const novoMes = new Date(this.mesAtual.setMonth(this.mesAtual.getMonth() + direcao));
  //   this.mesAtual = new Date(novoMes); // Garante que o Angular detecte a mudança
  //   this.gerarDiasDoMes(); // Regenera os dias para o novo mês
  // }

  navegarMes(direcao: number): void {
    const hoje = this.mesAtual; // Começa com o mês atual
    const novoInicio = new Date(hoje.setDate(hoje.getDate() + (30 * direcao))); // Avança ou retrocede 30 dias
    this.mesAtual = new Date(novoInicio); // Atualiza o início do período
    this.gerarDiasDoMes(); // Regenera os dias para o novo intervalo
  }
  
  
}
