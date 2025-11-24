import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MunicipioService } from 'src/app/site/services/municio.service';
import { NotificationService } from 'src/app/site/services/notification.service';
import { Router } from '@angular/router';
import { UsuarioService } from '../../services/usuario.service';

@Component({
  selector: 'app-configurador',
  templateUrl: './configurador.component.html',
  styleUrls: ['./configurador.component.css']
})
export class ConfiguradorComponent implements OnInit {
  configuradorForm: FormGroup;
  tipoPessoa: string = ''; // Tipo de Pessoa selecionado
  segmentoSelecionado: string | null = null;
  subtipoSelecionado: string | null = null;
  errorMessage: string | null = null; // 🔥 Variável para armazenar erros

  step = 1; // Etapa atual
  totalSteps = 4; // Total de etapas
  isSubmitting = false; // Flag para evitar requisições duplicadas
  municipios: any[] = []; // Lista de municípios
  uf: string[] = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT',
    'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO',
    'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  segmentosDetalhados: { [key: string]: string[] } = {
    Comércio: ['Revenda'],
    Serviços: ['Somente presta serviços', 'Prestação de serviços e Comércio'],
    'Indústria e Fabricação': ['Fabricação de alimentos', 'Artesanato em Geral', 'Produção de cosméticos e similares'],
    Eventos: ['Organização de eventos', 'Aluguel de equipamentos para eventos', 'Buffets'],
    Outros: ['Geral']
  };

  constructor(
    private fb: FormBuilder,
    private municipioService: MunicipioService,
    private usuarioService: UsuarioService,
    private cdRef: ChangeDetectorRef,
    private notificationService: NotificationService,
    private router: Router,
  ) {
    this.configuradorForm = this.fb.group({
      // 🔹 Dados do Usuário
      nome: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      senha: ['', [Validators.required, Validators.minLength(6)]],
      confirmSenha: ['', Validators.required],
      role: ['USER', Validators.required], // Padrão USER
      
      // 🔹 Dados da Empresa
      nomeFantasia: ['', Validators.required],
      razaoSocial: [''],
      documento: ['', [Validators.required, Validators.minLength(11), Validators.maxLength(14)]],
      segmentoAtividade: ['', Validators.required],
      tipoDeNegocio: ['', Validators.required],
      tipoDePessoa: ['', Validators.required],
      telefone: ['', Validators.required],
      emailEmpresa: ['', [Validators.required, Validators.email]],

      // 🔹 Endereço da Empresa
      endereco: this.fb.group({
        logradouro: ['', Validators.required],
        numero: ['', Validators.required],
        complemento: [''],
        bairro: ['', Validators.required],
        cep: ['', [Validators.required, Validators.pattern(/^\d{8}$/)]],
        municipio: this.fb.group({
          municipioIbge: [{ value: '', disabled: true }, Validators.required],
          uf: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(2)]]
        }),

        
      }),

      
      
      dataCriacao: [null], // Definido no backend
      dataAtualizacao: [null] // Atualizado automaticamente no backend
    });
  }

  getSegmentoKeys(): string[] {
    return Object.keys(this.segmentosDetalhados);
  }
  
  selecionarSegmento(segmento: string): void {
    this.segmentoSelecionado = segmento;
    this.configuradorForm.get('segmentoAtividade')?.setValue(segmento);
    this.configuradorForm.get('tipoDeNegocio')?.setValue(null); // 🔥 Limpa o subtipo
  }
  
  selecionarSubsegmento(subsegmento: string): void {
    this.subtipoSelecionado = subsegmento;
    this.configuradorForm.get('tipoDeNegocio')?.setValue(subsegmento);
  }
  

  ngOnInit(): void {
    this.carregarEstados();
    
  this.cdRef.detectChanges(); // 🔥 Força a interface a ser atualizada
  }
  atualizarTipoPessoa(): void {
    this.tipoPessoa = this.configuradorForm.get('tipoDePessoa')?.value;
  
    if (this.tipoPessoa === 'Jurídica') {
      this.configuradorForm.get('razaoSocial')?.setValidators([Validators.required]);
      this.configuradorForm.get('documento')?.setValidators([Validators.required, Validators.pattern(/^\d{14}$/)]);
    } else {
      this.configuradorForm.get('razaoSocial')?.clearValidators();
      this.configuradorForm.get('documento')?.setValidators([Validators.required, Validators.pattern(/^\d{11}$/)]);
    }
  
    // Atualiza a validação dos campos
    this.configuradorForm.get('razaoSocial')?.updateValueAndValidity();
    this.configuradorForm.get('documento')?.updateValueAndValidity();
  }
  

  carregarEstados(): void {
    console.log("🔄 Carregando estados...");
    this.uf = [
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT',
      'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO',
      'RR', 'SC', 'SP', 'SE', 'TO'
    ];
    this.cdRef.detectChanges(); // 🔥 Força a atualização da interface
    console.log("✅ Estados carregados:", this.uf);
  }

  onEstadoChange(): void {
    const estadoSelecionado = this.configuradorForm.get('endereco.municipio.uf')?.value;
    
    if (estadoSelecionado) {
      this.municipioService.getMunicipiosPorEstado(estadoSelecionado).subscribe(
        (data) => {
          this.municipios = data.map(municipio => ({
            codigoIbge: municipio.codigoIbge, // Código para envio ao backend
            nome: municipio.nome, // ✅ Agora pegamos o nome correto!
            uf: municipio.uf
          }));
  
          this.configuradorForm.get('endereco.municipio.municipioIbge')?.enable();
        },
        (error) => {
          console.error('❌ Erro ao buscar municípios:', error);
          this.municipios = [];
          this.configuradorForm.get('endereco.municipio.municipioIbge')?.disable();
        }
      );
    } else {
      this.municipios = [];
      this.configuradorForm.get('endereco.municipio.municipioIbge')?.disable();
    }
  }
  
  
  // 🔥 Novo método para atualizar o município corretamente
  onMunicipioChange(event: any): void {
    const municipioSelecionado = event.target.value;
    if (municipioSelecionado) {
      this.configuradorForm.get('endereco.municipio.municipioIbge')?.setValue(municipioSelecionado);
    }
  }
  


  avancar(): void {
    let camposInvalidos: string[] = [];

  
    switch (this.step) {
      case 1:
        if (!this.configuradorForm.get('nome')?.value) camposInvalidos.push('Nome');
        if (!this.configuradorForm.get('email')?.valid) camposInvalidos.push('Email');
        if (!this.configuradorForm.get('senha')?.valid) camposInvalidos.push('Senha');
        if (!this.configuradorForm.get('confirmSenha')?.valid || 
            this.configuradorForm.get('senha')?.value !== this.configuradorForm.get('confirmSenha')?.value) {
          camposInvalidos.push('Confirmação de Senha (As senhas devem coincidir)');
        }
        if (!this.configuradorForm.get('tipoDePessoa')?.value) camposInvalidos.push('Tipo de Pessoa');
        if (!this.configuradorForm.get('role')?.value) camposInvalidos.push('Função');
        break;

        case 2:
      if (!this.configuradorForm.get('segmentoAtividade')?.value) {
        camposInvalidos.push('Segmento de Atividade');
      }
      if (!this.configuradorForm.get('tipoDeNegocio')?.value) {
        camposInvalidos.push('Tipo de Negócio');
      }
      break;
  
        case 3:
          if (!this.configuradorForm.get('nomeFantasia')?.value) {
              camposInvalidos.push('Nome Fantasia');
          }
      
          // 🔥 Verifica se é Pessoa Jurídica ou Física
          const tipoPessoa = this.configuradorForm.get('tipoDePessoa')?.value;
      
          if (tipoPessoa === 'Jurídica') {
              if (!this.configuradorForm.get('razaoSocial')?.value) {
                  camposInvalidos.push('Razão Social');
              }
              if (!this.configuradorForm.get('documento')?.valid || this.configuradorForm.get('documento')?.value.length !== 14) {
                  camposInvalidos.push('CNPJ inválido');
              }
          } else if (tipoPessoa === 'Física') {
              if (!this.configuradorForm.get('documento')?.valid || this.configuradorForm.get('documento')?.value.length !== 11) {
                  camposInvalidos.push('CPF inválido');
              }
          }
      
          if (!this.configuradorForm.get('telefone')?.valid) {
              camposInvalidos.push('Telefone');
          }
          break;
      
  
      case 4:
        if (!this.configuradorForm.get('endereco.logradouro')?.value) camposInvalidos.push('Logradouro');
        if (!this.configuradorForm.get('endereco.numero')?.value) camposInvalidos.push('Número');
        if (!this.configuradorForm.get('endereco.bairro')?.value) camposInvalidos.push('Bairro');
        if (!this.configuradorForm.get('endereco.cep')?.valid) camposInvalidos.push('CEP');
        if (!this.configuradorForm.get('endereco.municipio.uf')?.value) camposInvalidos.push('Estado (UF)');
        if (!this.configuradorForm.get('endereco.municipio.municipioIbge')?.value) camposInvalidos.push('Município');
        break;
  
      
    }
  
    // Se houver campos inválidos, exibe alerta e impede avanço
    if (camposInvalidos.length > 0) {
      alert(`⚠️ Preencha os seguintes campos antes de avançar:\n\n- ${camposInvalidos.join('\n- ')}`);
      return;
    }
  
    // Se todos os campos estiverem preenchidos corretamente, avança para o próximo passo
    if (this.step < this.totalSteps) {
      this.step++;
      console.log(`✅ Avançando para a etapa ${this.step}`);
      if (this.step === 3) {
        this.carregarEstados();
        this.cdRef.detectChanges();
      }
    }
  }
  

  

  voltar(): void {
    if (this.step > 1) {
      this.step--;
    }
  }
 
  onSubmit(): void {
    if (this.isSubmitting) return;
    this.errorMessage = null; // 🔥 Limpar erros anteri
    const municipioIbgeValue = this.configuradorForm.get('endereco.municipio.municipioIbge')?.value;
    // const usuarioDTO = {
    //   nome: this.configuradorForm.get('nome')?.value,
    //   email: this.configuradorForm.get('email')?.value,
    //   senha: this.configuradorForm.get('senha')?.value,
    //   role: this.configuradorForm.get('role')?.value,
    //   empresa: { // EmpresaDTO dentro do usuário
    //     nomeFantasia: this.configuradorForm.get('nomeFantasia')?.value,
    //     razaoSocial: this.configuradorForm.get('razaoSocial')?.value,
    //     documento: this.configuradorForm.get('documento')?.value,
    //     segmentoAtividade: this.configuradorForm.get('segmentoAtividade')?.value,
    //     tipoDeNegocio: this.configuradorForm.get('tipoDeNegocio')?.value,
    //     tipoDePessoa: this.configuradorForm.get('tipoDePessoa')?.value,
    //     email: this.configuradorForm.get('emailEmpresa')?.value,
    //     telefone: this.configuradorForm.get('telefone')?.value,
    //     endereco: {
    //       logradouro: this.configuradorForm.get('endereco.logradouro')?.value,
    //       numero: this.configuradorForm.get('endereco.numero')?.value,
    //       complemento: this.configuradorForm.get('endereco.complemento')?.value,
    //       bairro: this.configuradorForm.get('endereco.bairro')?.value,
    //       cep: this.configuradorForm.get('endereco.cep')?.value,
    //       municipio: {
    //         municipioIbge: municipioIbgeValue, // ✅ Valor correto para o backend
    //         uf: this.configuradorForm.get('endereco.municipio.uf')?.value
    //       }
    //     }
    //   }
    // };
  
    const usuarioDTO = {
      nome: this.configuradorForm.get('nome')?.value,
      email: this.configuradorForm.get('email')?.value,
      senha: this.configuradorForm.get('senha')?.value,
      role: this.configuradorForm.get('role')?.value,
      empresa: { // EmpresaDTO dentro do usuário
        nomeFantasia: this.configuradorForm.get('nomeFantasia')?.value,
        razaoSocial: this.configuradorForm.get('razaoSocial')?.value,
        documento: this.configuradorForm.get('documento')?.value,
        segmentoAtividade: this.configuradorForm.get('segmentoAtividade')?.value,
        tipoDeNegocio: this.configuradorForm.get('tipoDeNegocio')?.value,
        tipoDePessoa: this.configuradorForm.get('tipoDePessoa')?.value,
        email: this.configuradorForm.get('emailEmpresa')?.value,
        telefone: this.configuradorForm.get('telefone')?.value,
        endereco: {
          logradouro: this.configuradorForm.get('endereco.logradouro')?.value,
          numero: this.configuradorForm.get('endereco.numero')?.value,
          complemento: this.configuradorForm.get('endereco.complemento')?.value,
          bairro: this.configuradorForm.get('endereco.bairro')?.value,
          cep: this.configuradorForm.get('endereco.cep')?.value,
          municipio: {
            municipioIbge: municipioIbgeValue,
            uf: this.configuradorForm.get('endereco.municipio.uf')?.value
          }
        },
        parametros: [ // ✅ Corrigido aqui!
          {
            chave: "exigeDocNoCadastro",
            valor: "true" // Ou você pode usar uma variável para decidir true/false
          }
        ]
      }
    };
    
    console.log('Enviando dados...', usuarioDTO);
    console.log('🔎 JSON Enviado para o Backend:', JSON.stringify(usuarioDTO, null, 2));

    this.usuarioService.cadastrarUsuario(usuarioDTO).subscribe(
      response => {
        this.notificationService.setMessage('✅ Cadastro realizado com sucesso! Verifique seu e-mail.');
        this.isSubmitting = false;
        this.router.navigate(['/login']); // ✅ Redirecionando para a tela de login
      },
      error => {
        console.error('❌ Erro ao cadastrar:', error);
        this.isSubmitting = false;
  
        if (error.error) {
          let mensagemErro = '';
  
          // 🔥 Se a resposta for uma string, tenta extrair apenas o email/documento
          if (typeof error.error === 'string') {
            const regexDocumento = /Chave \(documento\)=\((\d+)\)/;
            const regexEmail = /Chave \(email\)=\(([^)]+)\)/;
  
            const matchDocumento = error.error.match(regexDocumento);
            const matchEmail = error.error.match(regexEmail);
  
            if (matchDocumento) {
              mensagemErro = `O documento ${matchDocumento[1]} já existe!`;
  
              // 🔥 Voltar automaticamente para o Step 3
              this.step = 3;
  
              // 🔥 Marcar o campo como inválido
              const documentoControl = this.configuradorForm.get('documento');
              if (documentoControl) {
                documentoControl.setErrors({ documentoDuplicado: true });
                documentoControl.markAsTouched();
                documentoControl.markAsDirty();
              }
  
              // 🔥 Focar no campo do documento
              setTimeout(() => {
                const docInput = document.getElementById('documento');
                if (docInput) docInput.focus();
              }, 100);
            } 
            else if (matchEmail) {
              mensagemErro = `O e-mail ${matchEmail[1]} já está em uso!`;
  
              // 🔥 Voltar automaticamente para o Step 1
              this.step = 1;
  
              // 🔥 Marcar o campo como inválido
              const emailControl = this.configuradorForm.get('email');
              if (emailControl) {
                emailControl.setErrors({ emailDuplicado: true });
                emailControl.markAsTouched();
                emailControl.markAsDirty();
              }
  
              // 🔥 Focar no campo do e-mail
              setTimeout(() => {
                const emailInput = document.getElementById('email');
                if (emailInput) emailInput.focus();
              }, 100);
            } 
            else {
              mensagemErro = error.error;
            }
          } 
          
          // Se for um JSON e tiver "message", pega a mensagem diretamente
          else if (error.error.message) {
            mensagemErro = error.error.message;
          } 
          
          // Se não encontrou nada, usa um erro genérico
          else {
            mensagemErro = 'Erro ao cadastrar. Verifique os dados e tente novamente.';
          }
  
          this.errorMessage = mensagemErro;
        } else {
          this.errorMessage = 'Erro ao cadastrar. Verifique os dados e tente novamente.';
        }
      }
    );
  }
  
  }
  
  
  

