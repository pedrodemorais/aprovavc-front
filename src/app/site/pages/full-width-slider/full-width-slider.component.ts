import { Component, OnDestroy, OnInit } from '@angular/core';

type Slide = {
  image: string;
  titleHtml: string;     // permite <br/>
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

  currentIndex = 0;

  isTextAnimating = false;

  private intervalId: any;
  private readonly slideIntervalMs = 8000;

  // sincronize com o CSS (opacity transition)
  private readonly fadeMs = 900;
  private readonly textSwapDelayMs = 220;

  ngOnInit(): void {
    if (this.slides.length <= 1) return;

    this.intervalId = setInterval(() => {
      this.nextSlide();
    }, this.slideIntervalMs);
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  nextSlide(): void {
    if (this.slides.length <= 1) return;

    // anima o texto (some -> troca -> aparece)
    this.isTextAnimating = true;

    setTimeout(() => {
      this.currentIndex = (this.currentIndex + 1) % this.slides.length;
    }, this.textSwapDelayMs);

    setTimeout(() => {
      this.isTextAnimating = false;
    }, this.fadeMs);
  }
}
