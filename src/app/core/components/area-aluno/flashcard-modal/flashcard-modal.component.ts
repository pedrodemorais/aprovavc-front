import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FlashcardDTO } from '../models/FlashcardDTO';

@Component({
  selector: 'app-flashcard-modal',
  templateUrl: './flashcard-modal.component.html',
  styleUrls: ['./flashcard-modal.component.css']
})
export class FlashcardModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() materiaNome = '-';
  @Input() topicoDescricao = '-';
  @Input() initialData: Partial<FlashcardDTO> | null = null;
  @Input() salvando = false;
  @Input() mensagemSucesso?: string;

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<FlashcardDTO>();

  flashcardFrente = '';
  flashcardVerso = '';
  flashcardTipo = 'PERGUNTA_RESPOSTA';
  flashcardDificuldade = 'MEDIA';
  flashcardTags = '';
  flashcardVerdadeiroFalso: 'VERDADEIRO' | 'FALSO' | null = null;
  maxFlashcardFrente = 120;
  maxFlashcardVerso = 200;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.aplicarDadosIniciais();
    }
  }

  get isEdicao(): boolean {
    return Number(this.initialData?.id || 0) > 0;
  }

  get podeSalvar(): boolean {
    return !!this.flashcardFrente.trim() && !!this.flashcardVerso.trim() && !this.salvando;
  }

  onFlashcardTipoChange(tipo: string): void {
    this.flashcardTipo = tipo;

    if (tipo === 'VERDADEIRO_FALSO') {
      if (!this.flashcardVerdadeiroFalso) this.flashcardVerdadeiroFalso = 'VERDADEIRO';
      this.flashcardVerso = this.flashcardVerdadeiroFalso;
      return;
    }

    this.flashcardVerdadeiroFalso = null;
  }

  onFlashcardVerdadeiroFalsoChange(valor: 'VERDADEIRO' | 'FALSO'): void {
    this.flashcardVerdadeiroFalso = valor;
    if (this.flashcardTipo === 'VERDADEIRO_FALSO') {
      this.flashcardVerso = valor;
    }
  }

  fechar(): void {
    this.close.emit();
  }

  salvar(): void {
    if (this.flashcardTipo === 'VERDADEIRO_FALSO') {
      if (!this.flashcardVerdadeiroFalso) return;
      this.flashcardVerso = this.flashcardVerdadeiroFalso;
    }

    const frente = (this.flashcardFrente || '').trim();
    const verso = (this.flashcardVerso || '').trim();
    if (!frente || !verso) return;

    const materiaId = Number(this.initialData?.materiaId || 0);
    const topicoId = Number(this.initialData?.topicoId || 0);
    if (materiaId <= 0 || topicoId <= 0) return;

    const payload: FlashcardDTO = {
      id: Number(this.initialData?.id || 0) || undefined,
      materiaId,
      topicoId,
      frente,
      verso,
      tipo: this.flashcardTipo as FlashcardDTO['tipo'],
      dificuldade: this.flashcardDificuldade as FlashcardDTO['dificuldade'],
      tags: this.formatarTagsFlashcard(this.flashcardTags)
    };
    this.save.emit(payload);
  }

  private aplicarDadosIniciais(): void {
    const data = this.initialData || {};
    this.flashcardFrente = String(data.frente || '');
    this.flashcardVerso = String(data.verso || '');
    this.flashcardTipo = String(data.tipo || 'PERGUNTA_RESPOSTA');
    this.flashcardDificuldade = String(data.dificuldade || 'MEDIA');
    this.flashcardTags = String(data.tags || '');
    this.flashcardVerdadeiroFalso = null;

    if (this.flashcardTipo === 'VERDADEIRO_FALSO') {
      const verso = this.flashcardVerso.toUpperCase();
      this.flashcardVerdadeiroFalso = verso.startsWith('F') ? 'FALSO' : 'VERDADEIRO';
    }
  }

  private formatarTagsFlashcard(tags: string | undefined | null): string {
    return String(tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag, index, arr) => !!tag && arr.indexOf(tag) === index)
      .join(', ');
  }
}
