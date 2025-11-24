import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ComunicacaoService } from 'src/app/site/comunicacao.service';

@Component({
  selector: 'app-configuracao-os',
  templateUrl: './configuracao-os.component.html',
  styleUrls: ['./configuracao-os.component.css']
})
export class ConfiguracaoOsComponent implements OnInit {
 
  mostrarModal: boolean = false; // Controle do modal
configuracao = {
  tituloPadrao: 'Proposta de Serviços',
  descricaoPadrao: 'Descrição padrão da proposta...',
  observacoesPadrao: 'Observações e condições padrão...',
  rodapePadrao: 'Obrigado pela preferência!',
  exibirLogo: true,
  corTema: '#007BFF'
};
   constructor(private comunicacaoService: ComunicacaoService) {}
  ngOnInit(): void {
    this.comunicacaoService.emitirTitulo('Modelo Proposta OS');
   
  }
  
  @Input() visivel: boolean = false;
  @Output() fechar = new EventEmitter<void>();
  @Output() salvar = new EventEmitter<any>();



  fecharModal() {
    this.fechar.emit();
  }

  salvarConfiguracao() {
    this.salvar.emit(this.configuracao);
    this.fecharModal();
  }

  restaurarPadrao() {
    this.configuracao = {
      tituloPadrao: 'Proposta de Serviços',
      descricaoPadrao: 'Descrição padrão da proposta...',
      observacoesPadrao: 'Observações e condições padrão...',
      rodapePadrao: 'Obrigado pela preferência!',
      exibirLogo: true,
      corTema: '#007BFF'
    };
  }
}
