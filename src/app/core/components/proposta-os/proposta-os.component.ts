import { HttpClient } from '@angular/common/http';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { ComunicacaoService } from 'src/app/site/comunicacao.service';
import { catchError, debounceTime, distinctUntilChanged, filter, switchMap, takeUntil } from 'rxjs/operators';
import { of, Subject } from 'rxjs';
import { PropostaService } from 'src/app/site/services/proposta.service';
import { PropostaResponseDTO } from 'src/app/core/models/proposta.model';

declare var require: any; // necessário para que TypeScript aceite o require()
const html2pdf = require('html2pdf.js');

@Component({
  selector: 'app-proposta-os',
  templateUrl: './proposta-os.component.html',
  styleUrls: ['./proposta-os.component.css']
})
export class PropostaOsComponent implements OnInit, OnDestroy {
  mostrarTemplatePDF = false;
  isGerandoPdf = false;
  isSalvando = false;
  private destroy$ = new Subject<void>();
trackByIndex(index: number) { return index; }

  propostaForm!: FormGroup;
  mensagemStatus: string = '';
  totalVista: number = 0;
  totalPrazo: number = 0;

  propostaSalva?: PropostaResponseDTO;

  constructor(
    private fb: FormBuilder,
    private comunicacaoService: ComunicacaoService,
    private http: HttpClient,
    private propostaService: PropostaService
  ) { }

  ngOnInit() {
    console.log('📦 Componente PropostaOsComponent inicializado');

 this.comunicacaoService.acao$
  .pipe(
    filter(acao => !!acao),        // ignora nulos
    takeUntil(this.destroy$)
  )
  .subscribe((acao) => {
    console.log('📥 Ação recebida no PropostaOsComponent:', acao);
    this.executarAcao(acao);       // ✅ chama seu método central
  });

    this.comunicacaoService.emitirTitulo('Proposta OS');

   this.propostaForm = this.fb.group({
  numero: [{ value: null, disabled: true }],
  data: [new Date().toISOString().substring(0, 10), Validators.required],
  cliente: ['', Validators.required],           // ✅ obrigatório
  telefone: ['',Validators.required],                               // obrigatório em OU (com email)
  email: ['', [Validators.email]],              // obrigatório em OU (com telefone)
  origemLead: [''],
  descricao: ['Proposta de serviços de ar condicionado'],
  validade: [7],
  prazoExecucao: [''],
  condicoes: [''],
  observacoes: ['Não incluso reparos em gesso, pintura e elétrica.'],
  itens: this.fb.array([])                      // ✅ precisa ter 1+
}, { validators: [this.contatoObrigatorioValidator, this.itensObrigatoriosValidator] });
    this.carregarProximoNumero();
  }

  private carregarProximoNumero(): void {
  this.propostaService.getProximoNumero()
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: r => {
        // patchValue funciona mesmo com control desabilitado
        this.propostaForm.patchValue({ numero: r.numero }, { emitEvent: false });
      },
      error: err => {
        console.error('Erro ao obter próximo número:', err);
        this.mensagemStatus = 'Não foi possível obter o próximo número da proposta.';
      }
    });
}


  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    console.log('🧹 destroy$ completado no ngOnDestroy');
  }

  get itens(): FormArray {
    return this.propostaForm.get('itens') as FormArray;
  }

  adicionarItem(): void {
    this.itens.push(this.fb.group({
      descricao: ['', Validators.required],
      quantidade: [1, [Validators.required, Validators.min(1)]],
      unidade: ['un'],
      precoVista: [0, [Validators.required, Validators.min(0)]],
      precoPrazo: [0, [Validators.required, Validators.min(0)]],
      desconto: [0, [Validators.min(0), Validators.max(100)]]
    }));
  }

  removerItem(i: number): void {
    this.itens.removeAt(i);
    this.calcularTotais();
  }

  // >= 1 entre telefone ou email
private contatoObrigatorioValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const tel = group.get('telefone')?.value?.toString().trim();
  const email = group.get('email')?.value?.toString().trim();
  return (tel || email) ? null : { contatoObrigatorio: true };
};

// precisa ter ao menos 1 item
private itensObrigatoriosValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const itens = group.get('itens') as FormArray;
  return itens && itens.length > 0 ? null : { itensObrigatorios: true };
};

  calcularTotais(): void {
    let tv = 0;
    let tp = 0;
    this.itens.controls.forEach(item => {
      const qtd = Number(item.get('quantidade')?.value ?? 0);
      const precoVista = Number(item.get('precoVista')?.value ?? 0);
      const precoPrazo = Number(item.get('precoPrazo')?.value ?? 0);
      const desconto = Number(item.get('desconto')?.value ?? 0);

      const fator = 1 - (desconto / 100);
      tv += qtd * precoVista * fator;
      tp += qtd * precoPrazo * fator;
    });
    this.totalVista = tv;
    this.totalPrazo = tp;
  }

  gerarProposta(): void {
    if (this.propostaForm.invalid) {
      this.mensagemStatus = 'Preencha os campos obrigatórios.';
      this.propostaForm.markAllAsTouched();
      return;
    }

    if (this.isGerandoPdf) return;
    this.isGerandoPdf = true;
    this.mensagemStatus = 'Salvando proposta...';

    const dto = this.propostaService.toRequestDTO(this.propostaForm.value);

    // 1) Salva no backend
    this.propostaService.criar(dto).subscribe({
      next: (resp) => {
        this.propostaSalva = resp;
        this.totalVista = resp.totalVista;
        this.totalPrazo = resp.totalPrazo;

        this.mensagemStatus = `Proposta #${resp.id} salva. Gerando PDF...`;

        // 2) Gera PDF com dados oficiais do back
        this.gerarPdfComDados(resp);
      },
      error: (err) => {
        console.error(err);
        this.mensagemStatus = 'Erro ao salvar a proposta.';
        this.isGerandoPdf = false;
      }
    });
  }

  private gerarPdfComDados(resp: PropostaResponseDTO): void {
    this.http.get('assets/templates/template-proposta.html', { responseType: 'text' }).subscribe(html => {
      this.http.get('assets/templates/template-proposta.css', { responseType: 'text' }).subscribe(css => {

        const itensHtml = (resp.itens || []).map(item => `
          <tr>
            <td>${item.descricao}</td>
            <td>${item.quantidade}</td>
            <td>R$ ${(item.precoVista ?? 0).toFixed(2)}</td>
          </tr>
        `).join('');

        let htmlFinal = html
          .replace('{{cliente}}', resp.cliente ?? '')
          .replace('{{telefone}}', resp.telefone ?? '')
          .replace('{{email}}', resp.email ?? '')
          .replace('{{descricao}}', resp.descricao ?? '')
          .replace('{{totalVista}}', resp.totalVista.toFixed(2))
          .replace('{{totalParcelado}}', resp.totalPrazo.toFixed(2))
          .replace('{{itens}}', itensHtml);

        // container temporário
        const container = document.createElement('div');

        const styleTag = document.createElement('style');
        styleTag.textContent = css;
        container.appendChild(styleTag);

        const htmlContent = document.createElement('div');
        htmlContent.innerHTML = htmlFinal;
        container.appendChild(htmlContent);

        document.body.appendChild(container);

        const options = {
          margin: [10, 10, 10, 10],
          filename: `proposta-${resp.id}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, allowTaint: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().from(container).set(options).save()
          .then(() => this.mensagemStatus = `PDF gerado da proposta #${resp.id}.`)
          .catch((err: any) => {
            console.error('❌ Erro ao gerar PDF:', err);
            this.mensagemStatus = 'Erro ao gerar PDF.';
          })
          .finally(() => {
            container.remove();
            this.isGerandoPdf = false;
            console.log('🧹 PDF finalizado, flag resetada');
          });

      });
    });
  }

  enviarWhatsApp(): void {
    const cliente = this.propostaForm.get('cliente')?.value;
    const tel = this.propostaForm.get('telefone')?.value?.replace(/\D/g, '');
    const total = this.totalVista.toFixed(2);

    if (!tel) {
      alert('Informe o telefone para enviar WhatsApp');
      return;
    }

    const msg = `Olá ${cliente}, segue sua proposta de R$ ${total}`;
    window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`);
  }

salvarProposta(): void {
if (this.propostaForm.invalid) {
  this.mensagemStatus = 'Preencha os campos obrigatórios antes de salvar.';
  this.propostaForm.markAllAsTouched();

  const camposInvalidos: string[] = [];

  Object.keys(this.propostaForm.controls).forEach(campo => {
    const controle = this.propostaForm.get(campo);

    if (controle instanceof FormArray) {
      controle.controls.forEach((grupo, index) => {
        Object.keys(this.propostaForm.controls).forEach(nomeCampo => {
          if (grupo.get(nomeCampo)?.invalid) {
            camposInvalidos.push(`itens[${index}].${nomeCampo}`);
          }
        });
      });
    } else if (controle?.invalid) {
      camposInvalidos.push(campo);
    }
  });

  console.warn('⚠️ Campos obrigatórios não preenchidos ou inválidos:', camposInvalidos);
  return;
}


  if (this.isSalvando) return;
  this.isSalvando = true;
  this.mensagemStatus = 'Salvando proposta...';

  const dto = this.propostaService.toRequestDTO(this.propostaForm.value);

  // Se já tem proposta salva (id), atualiza; senão, cria
  const hasId = !!this.propostaSalva?.id;
  const req$ = hasId
    ? this.propostaService.atualizar(this.propostaSalva!.id, dto)
    : this.propostaService.criar(dto);

  req$.subscribe({
    next: (resp) => {
      this.propostaSalva = resp;           // mantém o id para futuras atualizações
      this.totalVista = resp.totalVista;   // usa os totais oficiais do backend
      this.totalPrazo = resp.totalPrazo;

      this.mensagemStatus = hasId
        ? `Proposta #${resp.id} atualizada com sucesso.`
        : `Proposta #${resp.id} criada com sucesso.`;
    },
    error: (err) => {
      console.error('Erro ao salvar a proposta:', err);
      this.mensagemStatus = 'Erro ao salvar a proposta. Verifique os dados e tente novamente.';
    },
    complete: () => {
      this.isSalvando = false;
    }
  });
}

  /** Chamado pelos botões no ContentComponent */
  executarAcao(acao: string): void {
    if (acao === 'pdf' && !this.isGerandoPdf) {
      this.gerarProposta();
    } else if (acao === 'whatsapp') {
      this.enviarWhatsApp();
    } else if (acao === 'lead') {
      this.salvarProposta();
    }
  }
}
