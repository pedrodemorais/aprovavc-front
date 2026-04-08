import {  Component, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup,ValidationErrors,Validators  } from '@angular/forms';
import { UsuarioService } from 'src/app/site/services/usuario.service';
import { ChangeDetectorRef } from '@angular/core';
import { MunicipioService } from 'src/app/site/services/municio.service';

import { HttpClient } from '@angular/common/http';
import { EmpresaService } from 'src/app/site/services/empresa.service';
import { EmpresaParametroService,  EmpresaParametroDTO } from 'src/app/site/services/empresa-parametro.service';
import { Dropdown } from 'primeng/dropdown'; // 🔥 Importação necessária para manipular o p-dropdown


import { enableProdMode } from '@angular/core';
import { ComunicacaoService } from 'src/app/site/comunicacao.service';
import { Subscription } from 'rxjs';
enableProdMode(); 


@Component({
  selector: 'app-empresa-cadastro',
  templateUrl: './empresa-cadastro.component.html',
  styleUrls: ['./empresa-cadastro.component.css'],
  
})
export class EmpresaCadastroComponent implements OnInit  {
private subscriptions: Subscription[] = [];

  empresaForm: FormGroup = new FormGroup({}); // ✅ Agora não é `undefined`
  exigeDocNoCadastroModel: boolean | null = null; // 🔹 Variável para sincronizar com o ngModel
  logoPreview: string | ArrayBuffer | null = null; // Para exibir a prévia da logomarca
  selectedLogoFile: File | null = null;
  readonly MAX_WIDTH = 300; // 🔹 Define a largura máxima permitida
  readonly MAX_HEIGHT = 300; // 🔹 Define a altura máxima permitida
  maxFileSizeMB = 1; // 🔥 Define o tamanho máximo do arquivo (1MB)
    // 🔥 Captura a referência do dropdown
    @ViewChild('dropdown') dropdown!: Dropdown;
  

  listaDeUfs: string[] = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT',
    'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO',
    'RR', 'SC', 'SP', 'SE', 'TO'
  ];
  listaMunicipios: any[] = [];

  tipoDePessoa = [
    { label: 'Física', value: 'Física' },
    { label: 'Jurídica', value: 'Jurídica' }
  ];
 

  

  constructor(private fb: FormBuilder, private usuarioService: UsuarioService,private empresaService: EmpresaService, 
    private cdr: ChangeDetectorRef,private municipioService: MunicipioService, private http: HttpClient,
    private empresaParametroService: EmpresaParametroService,private comunicacaoService: ComunicacaoService
     ) {
     
   
  }
  
  ngAfterViewInit(): void {
    this.cdr.detach(); // 🔥 Impede que o Angular detecte mudanças prematuramente
    setTimeout(() => {
      this.buscarUsuarioPorDocumento();
      this.cdr.reattach(); // 🔥 Reanexa a detecção de mudanças
    });
  }
  
  

  ngOnInit(): void {
    this.inicializarFormularios();
   
    setTimeout(() => {
      this.carregarParametroExigeDoc();
    }, 500); // 🔥 
      this.comunicacaoService.emitirTitulo('Meu Cadastro');
    this.empresaForm.get('tipoDePessoa')?.valueChanges.subscribe(tipo => {
      this.empresaForm.get('nomeFantasia')?.updateValueAndValidity(); // 🔥 Atualiza a validação ao mudar o tipo de pessoa
    });
    
  
 // 🔹 Armazena o tipo de pessoa inicial antes de mudanças
 let tipoDePessoaAnterior = this.empresaForm.get('empresa.tipoDePessoa')?.value;

 this.empresaForm.get('empresa.tipoDePessoa')?.valueChanges.subscribe(novoValor => {
   if (!tipoDePessoaAnterior) {
     tipoDePessoaAnterior = novoValor; // 🔹 Define valor inicial caso esteja vazio
     return;
   }

   if (novoValor !== tipoDePessoaAnterior) {
     // 🔥 Só limpa se o tipo foi REALMENTE alterado pelo usuário
     this.empresaForm.get('empresa.documento')?.reset();
     this.empresaForm.get('empresa.razaoSocial')?.reset();
   }

   tipoDePessoaAnterior = novoValor; // 🔹 Atualiza o valor anterior

   if (novoValor === 'Jurídica') {
     this.empresaForm.get('empresa.razaoSocial')?.setValidators([Validators.required]);
   } else {
     this.empresaForm.get('empresa.razaoSocial')?.clearValidators();
   }

   this.empresaForm.get('empresa.razaoSocial')?.updateValueAndValidity();
   this.empresaForm.get('empresa.documento')?.updateValueAndValidity();
 });

 this.subscriptions.push(
      this.comunicacaoService.salvar$.subscribe(() => {
        console.log('Recebido: salvar');
        this.onSalvar();
      }),
     
      
      this.comunicacaoService.imprimir$.subscribe(() => {
        console.log('Recebido: imprimir');
        this.onImprimir();
      })
    );
  }
  onImprimir() {
    throw new Error('Method not implemented.');
  }
  
  carregarParametroExigeDoc(): void {
    this.empresaParametroService.getParametroPorChave('exigeDocNoCadastro').subscribe({
      next: (valor) => {
        console.log('📌 Parâmetro recebido da API:', valor, typeof valor);
  
        if (valor !== null) {
          const booleanValue = valor.toString().toLowerCase() === 'true';
  
          this.empresaForm.get('empresa.exigeDocNoCadastro')?.setValue(booleanValue);
          this.cdr.detectChanges(); // 🔥 Garante que o Angular atualize a UI
        }
      },
      error: (err) => {
        console.error('❌ Erro ao buscar parâmetro exigeDocNoCadastro:', err);
      },
    });
  }
  
  



onLogoUpload(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
      const file = input.files[0];

      // 🔥 1. Verifica se o tipo do arquivo é válido (somente PNG e JPEG)
      const validTypes = ['image/png', 'image/jpeg'];
      if (!validTypes.includes(file.type)) {
          alert("⚠️ Apenas arquivos PNG e JPEG são permitidos.");
          input.value = ''; // Limpa o campo
          return;
      }

      // 🔥 2. Verifica se o tamanho do arquivo não ultrapassa o limite permitido
      const maxFileSizeBytes = this.maxFileSizeMB * 1024 * 1024;
      if (file.size > maxFileSizeBytes) {
          alert(`⚠️ O arquivo é muito grande! Máximo permitido: ${this.maxFileSizeMB}MB.`);
          input.value = ''; // Limpa o campo
          return;
      }

      // 🔥 3. Se passar as validações, processa a imagem
      this.selectedLogoFile = file;

      // 🔥 4. Criar uma prévia da imagem
      const reader = new FileReader();
      reader.onload = (e) => {
          this.logoPreview = e.target?.result as string;
      };
      reader.readAsDataURL(this.selectedLogoFile);
  }
}

markAllAsTouched(formGroup: FormGroup): void {
  Object.keys(formGroup.controls).forEach((campo) => {
    const controle = formGroup.get(campo);

    if (controle instanceof FormGroup) {
      this.markAllAsTouched(controle); // Aplica recursivamente nos subgrupos
    } else {
      controle?.markAsTouched();
      controle?.updateValueAndValidity();
    }
  });
}

resizeImage(file: File, maxWidth = 300, maxHeight = 300, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
          const img = new Image();
          img.src = event.target?.result as string;
          img.onload = () => {
              // 🔥 Criando um canvas para redimensionar a imagem
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;

              // 🔥 Ajusta o tamanho da imagem mantendo a proporção
              if (width > maxWidth || height > maxHeight) {
                  if (width > height) {
                      height *= maxWidth / width;
                      width = maxWidth;
                  } else {
                      width *= maxHeight / height;
                      height = maxHeight;
                  }
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.drawImage(img, 0, 0, width, height);
              }

              // 🔥 Converte o canvas para Blob (arquivo)
              canvas.toBlob((blob) => {
                  if (blob) {
                      resolve(blob);
                  } else {
                      reject(new Error("Erro ao redimensionar imagem"));
                  }
              }, file.type, quality);
          };
      };
      reader.onerror = (error) => reject(error);
  });
}

  

  
  onLogoUpload1(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    const input = event.target as HTMLInputElement;
    
  
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
  
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
  
          let originalWidth = img.width;
          let originalHeight = img.height;
          let newWidth = originalWidth;
          let newHeight = originalHeight;
  
          const maxWidth = 800;  // 🔹 Largura máxima
          const maxHeight = 600; // 🔹 Altura máxima
  
          // 🔥 Se a largura for maior que o máximo permitido, ajustamos mantendo a proporção
          if (originalWidth > maxWidth) {
            newWidth = maxWidth;
            newHeight = (originalHeight * maxWidth) / originalWidth;
          }
  
          // 🔥 Se a altura ainda for maior que o máximo permitido, ajustamos novamente
          if (newHeight > maxHeight) {
            newHeight = maxHeight;
            newWidth = (originalWidth * maxHeight) / originalHeight;
          }
  
          // Configurar o novo tamanho no canvas
          canvas.width = newWidth;
          canvas.height = newHeight;
          ctx?.drawImage(img, 0, 0, newWidth, newHeight);
  
          // Converter para Base64 e exibir no formulário
          this.logoPreview = canvas.toDataURL('image/png');
          this.empresaForm.get('empresa.logoEmpresa')?.setValue(this.logoPreview);
        };

        
      };
      reader.readAsDataURL(file);
    }
  }





  isPessoaJuridica(): boolean {
    return this.empresaForm?.get('empresa.tipoDePessoa')?.value === 'Jurídica';
  }
  

  /** 🔹 Inicializa o formulário completo com a estrutura correta */
  inicializarFormularios() {
 
    this.empresaForm = this.fb.group({
      nome: [''],
      email: [''],
     
      role: [''],
      ativo: [''],
      empresa: this.fb.group({
        nomeFantasia: [''],
        razaoSocial: ['',this.razaoSocialValidator.bind(this)],
        documento: ['',[Validators.required, this.cpfOuCnpjValidator.bind(this)]],
        segmentoAtividade: [''],
        tipoDeNegocio: [''],
        tipoDePessoa: [''],
        telefone: [''],
        dataCriacao: [''],
        email: [''],
        dataAtualizacao: [''],
        observacao: [''],
        exigeDocNoCadastro:[false],
        endereco: this.fb.group({
          logradouro: [''],
          numero: [''],
          complemento: [''],
          bairro: [''],
          cep: [''],
          municipio: this.fb.group({
            municipioIbge: ['',Validators.required],
            uf: ['',[Validators.required, Validators.minLength(2), Validators.maxLength(2)]],
            
          }),
          
        })
      })
    });
    
  }
  razaoSocialValidator(control: AbstractControl): ValidationErrors | null {
    if (!this.empresaForm) return null; // 🔹 Evita erro antes da inicialização
  
    const tipoDePessoa = this.empresaForm.get('empresa.tipoDePessoa')?.value;
    
    if (tipoDePessoa === 'Jurídica' && !control.value) {
      return { razaoSocialObrigatoria: true }; // 🔹 Retorna erro quando obrigatório
    }
    
    return null; // 🔹 Se for Pessoa Física, não precisa validar
  }


  
  

  /** 🔹 Busca usuário por documento e preenche o formulário */
  buscarUsuarioPorDocumento(): void {
    this.usuarioService.getUsuario().subscribe({
      next: (data) => {
        console.log('✅ Usuário encontrado:', data);
  
        // Define a UF e o Município antes de atualizar o formulário
        const ufBanco = data.empresa.endereco.municipio.uf;
        const municipioIbgeBanco = data.empresa.endereco.municipio.municipioIbge;
       
  
        // 🔥 Atualiza o formulário com os dados recebidos
        setTimeout(() => {
          this.empresaForm.patchValue({
            nome: data.nome,
            email: data.email,
            role: data.role,
            ativo: data.ativo ? 'Ativo' : 'Inativo',
            empresa: {
              nomeFantasia: data.empresa.nomeFantasia,
              razaoSocial: data.empresa.razaoSocial,
              documento: data.empresa.documento,
              segmentoAtividade: data.empresa.segmentoAtividade,
              tipoDeNegocio: data.empresa.tipoDeNegocio,
              tipoDePessoa: data.empresa.tipoDePessoa,
              telefone: data.empresa.telefone,
              dataCriacao: data.empresa.dataCriacao,
              dataAtualizacao: data.empresa.dataAtualizacao,
              email: data.empresa.email,
              observacao: data.empresa.observacao,
              exigeDocNoCadastro: data.empresa.exigeDocNoCadastro,
              endereco: {
                logradouro: data.empresa.endereco.logradouro,
                numero: data.empresa.endereco.numero,
                complemento: data.empresa.endereco.complemento,
                bairro: data.empresa.endereco.bairro,
                cep: data?.empresa?.endereco?.cep || '', // 🔥 Garante que `cep` nunca seja null
                municipio: {
                  municipioIbge: municipioIbgeBanco,
                  uf: ufBanco
                }
              }
            }
          });
  
          console.log('✅ Formulário preenchido com sucesso!');
  
          // 🔥 Agora busca os municípios dessa UF para garantir que o município esteja na lista
          this.onEstadoChange(false, ufBanco, municipioIbgeBanco);
  
          this.cdr.detectChanges(); // 🔥 Resolve problemas de detecção de mudança
        });
      },
      error: (err) => {
        console.error('❌ Erro ao buscar usuário:', err);
        alert('Erro ao carregar os dados do usuário.');
      }
    });
  }
  
 
  onUfChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const ufSelecionado = target ? target.value : '';
  
    if (ufSelecionado) {
      this.onEstadoChange(true, ufSelecionado);
    } else {
      console.warn("⚠️ Nenhuma UF selecionada.");
    }
  }
  

  onEstadoChange(usuarioAlterou: boolean, ufSelecionado: string, municipioIbgeBanco?: string | null): void {
    if (!ufSelecionado) {
      console.warn("⚠️ Nenhuma UF selecionada.");
      this.listaMunicipios = [];
      return;
    }
  
    console.log(`🔄 Buscando municípios para a UF: ${ufSelecionado}...`);
  
    this.municipioService.getMunicipiosPorEstado(ufSelecionado).subscribe(
      (data) => {
        if (data && data.length > 0) {
          this.listaMunicipios = data.map(municipio => ({
            codigoIbge: municipio.codigoIbge,
            nome: municipio.nome,
            uf: municipio.uf
          }));
  
          // 🔥 Se a mudança veio do banco, preenchemos o município
          if (!usuarioAlterou && municipioIbgeBanco) {
            const municipioEncontrado = this.listaMunicipios.find(m => m.nome === municipioIbgeBanco);
            if (municipioEncontrado) {
              this.empresaForm.get('empresa.endereco.municipio.municipioIbge')?.setValue(municipioEncontrado.nome);
            }
          } else {
            // 🔥 Se o usuário alterou, apenas limpamos o campo
            this.empresaForm.get('empresa.endereco.municipio.municipioIbge')?.setValue('');
          }
        } else {
          console.warn("⚠️ Nenhum município encontrado para a UF:", ufSelecionado);
          this.listaMunicipios = [];
        }
      },
      (error) => {
        console.error('❌ Erro ao buscar municípios:', error);
        this.listaMunicipios = [];
      }
    );
  }
  
  




onSalvar(): void {


  if (this.empresaForm.valid) {
      let formData = this.empresaForm.value;
      console.log('Imprimindo formData: ', formData);
      const dadosEmpresa = this.empresaForm.value;
      // 🔥 Aqui adicionamos os parâmetros dentro da empresa


      if (formData.empresa.tipoDePessoa === 'Física') {
          formData.empresa.razaoSocial = "";
      }

      console.log("💾 Salvando dados da empresa:", dadosEmpresa);
      formData.ativo = formData.ativo === 'Ativo';

      formData.empresa.parametros = [
        {
          chave: "exigeDocNoCadastro",
          valor: formData.empresa.exigeDocNoCadastro ? "true" : "false"
        }
      ];
  
      // 🔥 >>> Remove o exigeDocNoCadastro isolado para não poluir o objeto enviado
      delete formData.empresa.exigeDocNoCadastro;

      // 🔥 Se houver uma imagem selecionada, redimensiona antes de enviar
      if (this.selectedLogoFile) {
          this.resizeImage(this.selectedLogoFile).then((resizedImage) => {
              const formDataLogo = new FormData();
              formDataLogo.append("file", new File([resizedImage], this.selectedLogoFile!.name, { type: this.selectedLogoFile!.type }));

             
          }).catch(err => {
              console.error("❌ Erro ao redimensionar imagem:", err);
              alert("Erro ao processar a imagem.");
          });
      } else {
          // 🔥 Se não houver logomarca, apenas salva os dados da empresa
          this.salvarDadosEmpresa(dadosEmpresa);
          this.salvarParametro();
      }
  } else {
      this.marcarCamposInvalidos(this.empresaForm);
      alert("⚠️ Preencha todos os campos obrigatórios antes de salvar.");
  }
}



salvarParametro(): void {
  const novoValor = this.empresaForm.get('empresa.exigeDocNoCadastro')?.value;

  const parametroAtualizado: EmpresaParametroDTO = {
    chave: 'exigeDocNoCadastro',
    valor: novoValor.toString() // 🔥 Converte boolean para string
  };

  this.empresaParametroService.atualizarParametro(parametroAtualizado).subscribe({
    next: (res) => {
      console.log('✅ Parâmetro atualizado com sucesso!', res);
      alert('Parâmetro atualizado com sucesso!');
    },
    error: (err) => {
      console.error('❌ Erro ao atualizar o parâmetro:', err);
      alert(err.error ? err.error.error : 'Erro ao atualizar o parâmetro.');
    },
  });
}


/** 🔥 Função para marcar campos inválidos visualmente */
marcarCamposInvalidos(formGroup: FormGroup): void {
  Object.keys(formGroup.controls).forEach(campo => {
      const controle = formGroup.get(campo);

      if (controle instanceof FormGroup) {
          this.marcarCamposInvalidos(controle); // Aplica recursivamente nos grupos de controle
      } else {
          controle?.markAsTouched(); // Marca como tocado para exibir os erros
          controle?.updateValueAndValidity(); // Atualiza a validade para refletir os erros
      }
  });
}


// 🔥 Método separado para salvar os dados da empresa
salvarDadosEmpresa(dadosEmpresa: any): void {
    this.usuarioService.atualizarUsuario(dadosEmpresa).subscribe({
        next: (res) => {
            console.log("✅ Empresa salva com sucesso!", res);
            alert("Empresa atualizada com sucesso!");
        },
        error: (err) => {
            console.error("❌ Erro ao salvar empresa:", err);
            alert("Erro ao atualizar a empresa.");
        }
    });
}



  cpfOuCnpjValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) return null; // Se o campo estiver vazio, não valida
  
    const tipoDePessoa = this.empresaForm?.get('empresa.tipoDePessoa')?.value;
    const documento = control.value.replace(/\D/g, ''); // Remove caracteres não numéricos
  
    if (tipoDePessoa === 'Física') {
      if (documento.length !== 11 || !this.validarCPF(documento)) {
        return { cpfInvalido: true };
      }
    } else if (tipoDePessoa === 'Jurídica') {
      if (documento.length !== 14 || !this.validarCNPJ(documento)) {
        return { cnpjInvalido: true };
      }
    }
  
    return null;
  }
  

  /** 🔹 Valida CPF */
  validarCPF(cpf: string): boolean {
    if (!cpf || cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    let soma = 0, resto;

    for (let i = 1; i <= 9; i++) soma += parseInt(cpf[i - 1]) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf[9])) return false;

    soma = 0;
    for (let i = 1; i <= 10; i++) soma += parseInt(cpf[i - 1]) * (12 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    return resto === parseInt(cpf[10]);
  }

  /** 🔹 Valida CNPJ */
  validarCNPJ(cnpj: string): boolean {
    if (!cnpj || cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
    let tamanho = cnpj.length - 2, numeros = cnpj.substring(0, tamanho),
      digitos = cnpj.substring(tamanho), soma = 0, pos = tamanho - 7;

    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros[tamanho - i]) * pos--;
      if (pos < 2) pos = 9;
    }

    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos[0])) return false;

    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;

    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros[tamanho - i]) * pos--;
      if (pos < 2) pos = 9;
    }

    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    return resultado === parseInt(digitos[1]);
  }
}
  
  
  
  

