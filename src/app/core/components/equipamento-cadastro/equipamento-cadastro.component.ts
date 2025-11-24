import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators, ValidationErrors } from '@angular/forms';
import { ComunicacaoService } from 'src/app/site/comunicacao.service';

type Option<T = any> = { label: string; value: T | null };
type Cliente = { id: number; nome: string; documento?: string; contato?: string };

@Component({
  selector: 'app-equipamento-cadastro',
  templateUrl: './equipamento-cadastro.component.html',
  styleUrls: ['./equipamento-cadastro.component.css']
})
export class EquipamentoCadastroComponent implements OnInit {

  equipForm!: FormGroup;

  // sugestões para o AutoComplete (mock; troque por service)
  clienteSugestoes: Cliente[] = [];

  // opções
  tiposEquip: Option<string>[] = [
    { label: 'Celular/Smartphone', value: 'CELULAR' },
    { label: 'Ar-Condicionado',    value: 'AR_CONDICIONADO' },
    { label: 'Geladeira',          value: 'GELADEIRA' },
    { label: 'Notebook/Computador',value: 'INFORMATICA' },
    { label: 'Outros',             value: 'OUTROS' },
  ];

  tensoes: Option<string | number>[] = [
    { label: 'Bivolt', value: 'BIVOLT' },
    { label: '110V',   value: 110 },
    { label: '127V',   value: 127 },
    { label: '220V',   value: 220 },
    { label: 'Não informado', value: null },
  ];

  estadosFisicos: Option<string>[] = [
    { label: 'Bom', value: 'BOM' },
    { label: 'Regular', value: 'REGULAR' },
    { label: 'Ruim', value: 'RUIM' },
    { label: 'Oxidado', value: 'OXIDADO' },
    { label: 'Trincado/Quebrado', value: 'TRINCADO' },
  ];

  opcoesSimNao: Option<boolean>[] = [
    { label: 'Sim', value: true },
    { label: 'Não', value: false },
  ];

  tiposBloqueio: Option<string>[] = [
    { label: 'PIN', value: 'PIN' },
    { label: 'Senha', value: 'SENHA' },
    { label: 'Padrão', value: 'PADRAO' },
    { label: 'Conta (iCloud/Google)', value: 'CONTA' },
  ];

  acessoriosPadrao: Option<string>[] = [
    { label: 'Carregador/Fonte', value: 'CARREGADOR' },
    { label: 'Cabo', value: 'CABO' },
    { label: 'Bateria', value: 'BATERIA' },
    { label: 'Case/Capa', value: 'CAPA' },
    { label: 'Cartão SIM', value: 'SIM' },
    { label: 'Controle Remoto', value: 'CONTROLE' },
    { label: 'Suportes/Parafusos', value: 'SUPORTES' },
    { label: 'Outros', value: 'OUTROS' },
  ];

  constructor(private fb: FormBuilder,private cdr: ChangeDetectorRef, private comunicacaoService: ComunicacaoService) {}

  ngOnInit(): void {
     this.comunicacaoService.emitirTitulo('Cadastro de Equipamento');
    this.equipForm = this.fb.group({
      // Cliente
      cliente: [null],
      contato: [null],
      documento: [null],

      // Equipamento
      tipo: [null, Validators.required],
      marca: [null],
      modelo: [null],
      numeroSerie: [null],
      cor: [null],
      ano: [null],
      tensao: [null],
      btus: [null], // só para ar-condicionado
      localizacao: [null],

      // Check-in & condições
      estadoFisico: [null],
      liga: [null],
      bloqueado: [false],
      tipoBloqueio: [null],
      senhaDesbloqueio: [null], // obrigatório se bloqueado

      acessorios: [[]],
      defeitoRelatado: [null, Validators.required],
      observacoesCondicao: [null],

      // Garantia
      emGarantia: [false],
      dataCompra: [null],
      comprovanteGarantia: [null], // filename ou id do backend

      // Consentimentos
      autorizaBackup: [false],
      autorizaReset: [false],
      aceiteTermos: [false, Validators.requiredTrue],
    }, {
      validators: [this.senhaObrigatoriaQuandoBloqueado(), this.validarGarantia()],
    });

    // Se não bloqueado, limpar campos relacionados
    this.equipForm.get('bloqueado')?.valueChanges.subscribe(v => {
      if (!v) {
        this.equipForm.patchValue({ tipoBloqueio: null, senhaDesbloqueio: null }, { emitEvent: false });
      }
    });
     Promise.resolve().then(() => this.cdr.detectChanges());
  }

  // ====== Validadores compostos ======
  private senhaObrigatoriaQuandoBloqueado() {
    return (group: AbstractControl): ValidationErrors | null => {
      const bloqueado = group.get('bloqueado')?.value === true;
      const senha = (group.get('senhaDesbloqueio')?.value || '').toString().trim();
      if (bloqueado && !senha) {
        group.get('senhaDesbloqueio')?.setErrors({ required: true });
        return { senhaObrigatoria: true };
      }
      return null;
    };
  }

  /** Se emGarantia = true, exige pelo menos dataCompra OU comprovante */
  private validarGarantia() {
    return (group: AbstractControl): ValidationErrors | null => {
      const emGarantia = group.get('emGarantia')?.value === true;
      if (!emGarantia) return null;

      const dataCompra = group.get('dataCompra')?.value;
      const comp = group.get('comprovanteGarantia')?.value;

      if (!dataCompra && !comp) {
        return { garantiaInvalida: 'Informe a data de compra ou anexe o comprovante.' };
      }
      return null;
    };
  }

  // ====== Uploads ======
  onUploadFotos(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (files.length) {
      console.log('Fotos:', files.map(f => f.name));
      // TODO: enviar para backend e salvar IDs/URLs recebidas
    }
  }

  onUploadDocs(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (files.length) {
      console.log('Docs adicionais:', files.map(f => f.name));
      // TODO: idem
    }
  }

  onUploadGarantia(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      console.log('Comprovante de garantia:', file.name);
      // TODO: enviar e setar retorno (ex.: ID do arquivo)
      this.equipForm.patchValue({ comprovanteGarantia: file.name }, { emitEvent: false });
    }
  }

  // ====== Cliente (AutoComplete mock) ======
  filtrarClientes(e: { query: string }) {
    const q = (e.query || '').toLowerCase();
    // MOCK: substitua por service HTTP
    const base: Cliente[] = [
      { id: 1, nome: 'João Silva', documento: '123.456.789-00', contato: '(11) 99999-0000' },
      { id: 2, nome: 'Empresa X LTDA', documento: '12.345.678/0001-90', contato: '(11) 4002-8922' },
    ];
    this.clienteSugestoes = base.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      (c.documento || '').toLowerCase().includes(q) ||
      (c.contato || '').toLowerCase().includes(q)
    );
  }

  // ====== Ações ======
  onSalvar() {
    if (this.equipForm.invalid) {
      this.equipForm.markAllAsTouched();
      console.warn('Form inválido:', this.equipForm.errors);
      return;
    }

    const v = this.equipForm.value;

    const payload = {
      // vínculo
      clienteId: v.cliente?.id ?? null,

      // identificação
      tipo: v.tipo,
      marca: this.trimOrNull(v.marca),
      modelo: this.trimOrNull(v.modelo),
      numeroSerie: this.trimOrNull(v.numeroSerie),
      cor: this.trimOrNull(v.cor),
      ano: this.toIntOrNull(v.ano),
      tensao: v.tensao ?? null,
      btus: this.toIntOrNull(v.btus),
      localizacao: this.trimOrNull(v.localizacao),

      // check-in & condições
      estadoFisico: v.estadoFisico ?? null,
      liga: v.liga ?? null,
      bloqueado: !!v.bloqueado,
      tipoBloqueio: v.bloqueado ? v.tipoBloqueio : null,
      senhaDesbloqueio: v.bloqueado ? this.trimOrNull(v.senhaDesbloqueio) : null,

      acessorios: Array.isArray(v.acessorios) ? v.acessorios : [],
      defeitoRelatado: this.trimOrNull(v.defeitoRelatado),
      observacoesCondicao: this.trimOrNull(v.observacoesCondicao),

      // garantia
      emGarantia: !!v.emGarantia,
      dataCompra: v.dataCompra ? this.toISODate(v.dataCompra) : null,
      comprovanteGarantia: v.comprovanteGarantia ?? null,

      // consentimentos
      autorizaBackup: !!v.autorizaBackup,
      autorizaReset: !!v.autorizaReset,
      aceiteTermos: !!v.aceiteTermos,
    };

    console.log('📤 Equipamento payload:', payload);
    // TODO: chamar service HTTP para persistir
  }

  onLimpar() {
    this.equipForm.reset({
      bloqueado: false,
      emGarantia: false,
      autorizaBackup: false,
      autorizaReset: false,
      aceiteTermos: false
    });
  }

  // ====== Helpers ======
  isInvalid(control: string): boolean {
    const c = this.equipForm.get(control);
    return !!(c && c.touched && c.invalid);
  }

  private trimOrNull(v: any): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s || null;
  }

  private toIntOrNull(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }

  private toISODate(v: any): string | null {
    // aceita yyyy-mm-dd (input[type=date]) e retorna ISO no mesmo dia
    if (!v) return null;
    try {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return null;
      // formatar yyyy-mm-dd
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch { return null; }
  }
}
