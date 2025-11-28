import { Component } from '@angular/core';

@Component({
  selector: 'app-editor-teste',
  templateUrl: './editor-teste.component.html'
})
export class EditorTesteComponent {
  // valor padrão inicial
  texto: string = '<p>Texto padrão do editor de <b>teste</b>. Pode editar à vontade.</p>';

  onChange(event: any) {
    console.log('>>> onChange(htmlValue) =', event.htmlValue);
    this.texto = event.htmlValue || '';
  }

  salvar() {
    localStorage.setItem('editor_teste', this.texto);
    console.log('>>> SALVO localStorage[editor_teste] =', this.texto);
  }

  carregar() {
    const salvo = localStorage.getItem('editor_teste');
    if (salvo) {
      console.log('>>> CARREGADO localStorage[editor_teste] =', salvo);
      this.texto = salvo;
    } else {
      console.log('>>> NADA salvo em editor_teste');
    }
  }
}
