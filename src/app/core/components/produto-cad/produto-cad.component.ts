import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

type SelectOption<T = any> = { label: string; value: T };

@Component({
  selector: 'app-produto-cad',
  templateUrl: './produto-cad.component.html',
  styleUrls: ['./produto-cad.component.css']
})
export class ProdutoCadComponent implements OnInit {

  produtoForm!: FormGroup;

  categorias: SelectOption<string>[] = [
    { label: 'Celular/Smartphone', value: 'CELULAR' },
    { label: 'Ar-Condicionado',    value: 'AR_CONDICIONADO' },
    { label: 'Geladeira',          value: 'GELADEIRA' },
    { label: 'Outros',             value: 'OUTROS' },
  ];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.produtoForm = this.fb.group({
      // identificação
      codigo: [null, Validators.required],
      codigoBarras: [null],
      descricao: [null, Validators.required],
      categoria: [null, Validators.required],
      marca: [null],
      modelo: [null],
      referencia: [null],
      ativo: [true, Validators.required],

      // série/IMEI
      exigeSerie: [false, Validators.required],
      numeroSerie: [null],

      // preços e estoque
      precoCompra: [null],      // string BR "1.234,56"
      precoVenda: [null],       // string BR "1.234,56"
      estoqueAtual: [0],
      estoqueMinimo: [0],
      localizacaoEstoque: [null],

      // dimensões
      altura: [null],
      largura: [null],
      profundidade: [null],
      pesoLiquido: [null],
      pesoBruto: [null],

      // descrições
      descricaoPublica: [null],
      observacoesInternas: [null],
    });

    // Se não exige série, limpa o campo
    this.produtoForm.get('exigeSerie')?.valueChanges.subscribe(v => {
      if (!v) this.produtoForm.get('numeroSerie')?.reset();
    });
  }

  // ======= Helpers de validação =======
  isInvalid(control: string): boolean {
    const c = this.produtoForm.get(control);
    return !!(c && c.touched && c.invalid);
  }

  // ======= Uploads (stubs) =======
  onUploadImagem(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      console.log('Imagem selecionada:', file.name, file.size);
      // TODO: enviar ao backend / preview
    }
  }

  onUploadFicha(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      console.log('PDF selecionado:', file.name, file.size);
      // TODO: enviar ao backend
    }
  }

  // ======= Ações =======
  onSalvar() {
    if (this.produtoForm.invalid) {
      this.produtoForm.markAllAsTouched();
      return;
    }

    const raw = this.produtoForm.value;

    const payload = {
      // identificação
      codigo: this.trimOrNull(raw.codigo),
      codigoBarras: this.trimOrNull(raw.codigoBarras),
      descricao: this.trimOrNull(raw.descricao),
      categoria: raw.categoria,
      marca: this.trimOrNull(raw.marca),
      modelo: this.trimOrNull(raw.modelo),
      referencia: this.trimOrNull(raw.referencia),
      ativo: !!raw.ativo,

      // série
      exigeSerie: !!raw.exigeSerie,
      numeroSerie: raw.exigeSerie ? this.trimOrNull(raw.numeroSerie) : null,

      // preços e estoque
      precoCompra: this.parseMoedaBR(raw.precoCompra), // -> number | null
      precoVenda:  this.parseMoedaBR(raw.precoVenda),
      estoqueAtual: this.toIntOrNull(raw.estoqueAtual) ?? 0,
      estoqueMinimo: this.toIntOrNull(raw.estoqueMinimo) ?? 0,
      localizacaoEstoque: this.trimOrNull(raw.localizacaoEstoque),

      // dimensões
      altura: this.toNumberOrNull(raw.altura),
      largura: this.toNumberOrNull(raw.largura),
      profundidade: this.toNumberOrNull(raw.profundidade),
      pesoLiquido: this.toNumberOrNull(raw.pesoLiquido),
      pesoBruto: this.toNumberOrNull(raw.pesoBruto),

      // descrições
      descricaoPublica: this.trimOrNull(raw.descricaoPublica),
      observacoesInternas: this.trimOrNull(raw.observacoesInternas),
    };

    console.log('📤 Payload pronto para enviar:', payload);
    // TODO: chamar service HTTP e tratar resposta
  }

  onLimpar() {
    this.produtoForm.reset({
      ativo: true,
      exigeSerie: false,
      estoqueAtual: 0,
      estoqueMinimo: 0
    });
  }

  // ======= Máscara simples de moeda (BRL) — chame no (blur) dos inputs =======
  formatarMoeda(controlName: 'precoCompra' | 'precoVenda') {
    const ctrl = this.produtoForm.get(controlName);
    const val = (ctrl?.value ?? '').toString();

    if (!val) { ctrl?.setValue(null, { emitEvent: false }); return; }

    const digits = val.replace(/\D/g, '');
    if (!digits) { ctrl?.setValue(null, { emitEvent: false }); return; }

    const intPart = digits.slice(0, -2) || '0';
    const decPart = digits.slice(-2);
    const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    ctrl?.setValue(`${intFormatted},${decPart}`, { emitEvent: false });
  }

  // ======= Utils =======
  private trimOrNull(v: any): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s : null;
  }

  /** "1.234,56" -> 1234.56; null/'' -> null */
  private parseMoedaBR(v: any): number | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const normalized = s.replace(/\./g, '').replace(',', '.');
    const num = Number(normalized);
    return isNaN(num) ? null : Number(num.toFixed(2));
  }

  private toIntOrNull(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }

  private toNumberOrNull(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
}
