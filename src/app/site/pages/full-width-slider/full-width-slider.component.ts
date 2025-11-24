import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-full-width-slider',
  templateUrl: './full-width-slider.component.html',
  styleUrls: ['./full-width-slider.component.css']
})
export class FullWidthSliderComponent implements OnInit {
  slides = [
    {
      image: 'assets/img/img11.jpg',
      title: 'Soluções para Microempreendedores',
      description: 'Descubra ferramentas incríveis para facilitar sua gestão financeira e administrativa.',
      link: '/solucoes'
    },
    {
      image: 'assets/img/img2.jpg',
      title: 'Organize seu Negócio com Facilidade',
      description: 'Automatize tarefas e tenha controle total sobre seus clientes, vendas e estoque.',
      link: '/organizacao'
    },
    {
      image: 'assets/img/img3.jpg',
      title: 'Transforme sua Rotina',
      description: 'Aproveite tecnologia acessível para impulsionar seu negócio para o próximo nível.',
      link: '/tecnologia'
    }
  ];

  currentIndex: number = 0;

  constructor() {}

  ngOnInit() {
    setInterval(() => {
      this.nextSlide();
    }, 8000); // Troca de imagem a cada 5 segundos
  }

  nextSlide() {
    this.currentIndex = (this.currentIndex + 1) % this.slides.length;
  }
}
