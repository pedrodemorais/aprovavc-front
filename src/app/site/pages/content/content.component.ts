import { Component, OnInit } from '@angular/core';
import { ComunicacaoService } from '../../comunicacao.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-content',
  templateUrl: './content.component.html',
  styleUrls: ['./content.component.css']
})

export class ContentComponent implements OnInit {



   tituloTela: string = '';
   mostrarConfiguracao: boolean = false; // <-- controla o modal


   constructor(private comunicacaoService: ComunicacaoService,private router: Router) {}

 get isPropostaOS(): boolean {
    // Ajuste o caminho conforme sua rota real
    return this.router.url.includes('/proposta');
  }
 get isMeuCadastro(): boolean {
    // Ajuste o caminho conforme sua rota real
    return this.router.url.includes('/meu-cadastro');
  }

 ngOnInit(): void {
    this.comunicacaoService.titulo$.subscribe(titulo => {
      this.tituloTela = titulo;
    });
      // Escuta eventos do serviço para abrir modal
    this.comunicacaoService.acao$.subscribe(acao => {
      if (acao === 'configurar') {
        this.mostrarConfiguracao = true;
      }
    });
  }
  
  voltar() {
  window.history.back();
}

onNovo() {
  this.comunicacaoService.emitirNovo();
    console.log('Novo clicado');
    // lógica para novo registro
  }

  onSalvar() {
    console.log('Salvar clicado');
    this.comunicacaoService.emitirSalvar();
    // lógica para salvar
  }

  onExcluir() {
    this.comunicacaoService.emitirExcluir();
    console.log('Excluir clicado');
    // lógica para excluir
  }

  onPesquisar() {
     this.comunicacaoService.emitirPesquisar();
    console.log('Pesquisar clicado');
    // lógica para pesquisar
  }

  onImprimir() {
    this.comunicacaoService.emitirImprimir();
    console.log('Imprimir clicado');
    // lógica para imprimir
  }

  onGerarPDF() { 
     console.log('🧭 Emitindo evento de geração de PDF');
    this.comunicacaoService.emitirAcao('pdf'); }

   onWhatsApp() { 
    this.comunicacaoService.emitirAcao('whatsapp'); }

   onSalvarLead() { 
     console.log('OnSalvarLead:');
    this.comunicacaoService.emitirAcao('lead'); }

   onConfigurar() {
  this.router.navigate(['/area-restrita/content/configuracao-os']);
  }

  salvarConfiguracao(config: any) {
    console.log('Configuração salva:', config);
    // aqui você pode salvar via HTTP no back-end
    this.mostrarConfiguracao = false;
  }

  onUltimo() {
    this.comunicacaoService.emitirOnUltimo();
    console.log('Ultimo clicado');
}
onProximo() {
this.comunicacaoService.emitirOnProximo();
}
onAnterior() {
    this.comunicacaoService.emitirOnAnterior();
    console.log('Anterior clicado');
}
onPrimeiro() {
    this.comunicacaoService.emitirOnPrimeiro();
    console.log('Primeiro clicado');
}
}
