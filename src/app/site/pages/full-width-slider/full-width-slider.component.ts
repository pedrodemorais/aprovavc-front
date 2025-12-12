import { Component, OnDestroy, OnInit } from '@angular/core';

type Slide = {
  image: string;
  titleHtml: string;     // <- permite <br>
  description: string;
  link: string;
  buttonText?: string;
};

@Component({
  selector: 'app-full-width-slider',
  templateUrl: './full-width-slider.component.html',
  styleUrls: ['./full-width-slider.component.css']
})
export class FullWidthSliderComponent implements OnInit, OnDestroy {

  slides: Slide[] = [
    {
      image: 'assets/img/dyn.png',
      titleHtml: 'Clareza no plano.<br/>Constância no estudo.<br/>Resultado na aprovação.',
      description: 'O AprovaVC organiza sua rotina, acompanha seu progresso e transforma esforço em aprovação real.',
      link: '/configurador',
      buttonText: 'Começar agora'
    },
    {
      image: 'assets/img/estude.png',
      titleHtml: 'Revisões no tempo certo.<br/>Foco no que importa.<br/>Evolução visível.',
      description: 'Você estuda com método: metas, ciclos de revisão e acompanhamento claro do que fazer hoje.',
      link: '/configurador',
      buttonText: 'Criar minha conta'
    }
  ];

  currentIndex: number = 0;

  isTransitioning = false;

  private intervalId: any;
  private readonly slideIntervalMs = 8000;
  private readonly transitionMs = 450;

  ngOnInit() {
    this.intervalId = setInterval(() => {
      this.nextSlide();
    }, this.slideIntervalMs);
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  nextSlide() {
    if (this.isTransitioning) return;

    this.isTransitioning = true;

    setTimeout(() => {
      this.currentIndex = (this.currentIndex + 1) % this.slides.length;
      this.isTransitioning = false;
    }, this.transitionMs);
  }
}
