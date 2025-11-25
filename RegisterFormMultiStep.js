class RegisterFormMultiStep extends HTMLElement {
    connectedCallback() {
        this.style.display = 'none';
        const waitLang = setInterval(() => {
            if (window.zhopium &&
                zhopium.Language &&
                zhopium.Language.login &&
                zhopium.UseMultiStepRegistration === true) {
                clearInterval(waitLang);
                this.render();

                // **NUEVO: Esperar a que el MultiStepController esté montado**
                const waitForController = setInterval(() => {
                    const controller = document.querySelector('multi-step-controller');
                    if (controller && window.multiStep) {
                        clearInterval(waitForController);
                        this.injectProgressAndActionsIntoHostForm();
                        this.setupEvents();
                        console.log('RegisterFormMultiStep: listo (oculto) con barra embebida en host');
                    }
                }, 50);

            } else if (window.zhopium && zhopium.UseMultiStepRegistration === false) {
                clearInterval(waitLang);
                this.style.display = 'none';
            }
        }, 50);
    }

    injectProgressAndActionsIntoHostForm() {
        const hostForm = document.getElementById('register-form');
        if (!hostForm) return;

        // --- 1) Inyectar barra de progreso DESPUÉS del header (si no existe)
        if (!hostForm.querySelector('.step-progress.embedded')) {
            const sourceBar = this.querySelector('.step-progress');
            const header = hostForm.querySelector('header');

            if (sourceBar && header) {
                const cloned = sourceBar.cloneNode(true);
                cloned.classList.add('embedded');
                // Insertar DESPUÉS del header en lugar de al inicio del form
                header.insertAdjacentElement('afterend', cloned);
            }
        }


        // --- 2) Reemplazar bloque de acciones inferior por botones de Paso 1
        const actions = document.getElementById('register-actions');
        if (actions && !actions.dataset.msBound) {
            actions.innerHTML = `
          <button type="button" class="btn btn-dark rounded-5 w-100" onclick="window.MultiStepBridge.goToStep2FromHost()" data-i18n="NextButton">
            Siguiente
          </button>
          <div class="px-4">
            <button type="button" class="btn btn-outline-dark rounded-5 w-100" onclick="signin.toggleForm('login-form')" data-i18n="ReturnButton">
              Volver
            </button>
          </div>`;
            actions.dataset.msBound = '1';
        }

        // **CAMBIO: Esperar a que multiStep esté disponible antes de inicializar**
        const waitForMultiStep = setInterval(() => {
            if (window.multiStep) {
                clearInterval(waitForMultiStep);
                window.multiStep.goToStep(1); // Usar goToStep en lugar de asignar directamente
                console.log('MultiStep inicializado en paso 1');
            }
        }, 50);

        // **NUEVO: Mostrar campos adicionales en modo multi-step**
        this.showValidationFieldsInHost();
    }





    render() {
        this.innerHTML = /* html */ `
            <div class="container px-1 px-xxl-6" style="min-height: 330px;">
              <!-- Barra de progreso (fuente para clonar al host) -->
              <div class="step-progress">
                <div class="step-item item-1 active" data-step="1">
                  <span class="step-label span-1" data-i18n="StepConfirmData">Confirmación datos</span>
                  <div class="step-number">1</div>
                </div>
                <div class="step-item item-2" data-step="2">
                  <span class="step-label span-2" data-i18n="StepUploadDoc">Cargue documento</span>
                  <div class="step-number">2</div>
                </div>
                <div class="step-item item-3" data-step="3">
                  <span class="step-label span-3" data-i18n="StepValidationCode">Código de validación</span>
                  <div class="step-number">3</div>
                </div>
              </div>

              <!-- Step 2: Upload de Documentos -->
              <div class="step-content" data-step="2">
                <div id="upload-instructions" class="upload-initial-view">
                  <header class="mb-4">
                    <h5 class="fw-bold lh-sm text-white mb-3" data-i18n="UploadDocTitle">Carga foto de documento</h5>
                    <p class="fw-semibold lh-sm small text-white mb-2" data-i18n="UploadDocInstructions">Instrucciones para cargar el documento de identidad:</p>
                    <ol class="small text-white" style="max-width: 400px; margin: 0 auto; text-align: left; display: inline-block;">
                      <li data-i18n="UploadInstruction1">Debes tomar la fotografía por ambas caras del documento.</li>
                      <li data-i18n="UploadInstruction2">Debe ser tomada de la original.</li>
                      <li data-i18n="UploadInstruction3">Ambas caras deben ser legibles y nítidas.</li>
                      <li data-i18n="UploadInstruction4">Debe salir el documento completo.</li>
                    </ol>
                  </header>
                  <div class="text-center mt-4">
                    <button type="button" class="btn btn-warning rounded-pill px-5 py-2" onclick="multiStep.showUploadFields()">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="me-2" viewBox="0 0 16 16">
                        <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
                        <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z" />
                      </svg>
                      <span data-i18n="ChooseFilesButton">Elegir archivos</span>
                    </button>
                    <p class="small text-white mt-3" data-i18n="FileFormatInfo">
                        Solo puedes cargar máximo 2 archivos, en formato JPG o PNG
                    </p>
                  </div>
                </div>

                <div id="upload-fields" class="upload-fields-view" style="display: none;">
                  <header class="mb-4">
                    <h5 class="fw-bold lh-sm text-white mb-3" data-i18n="UploadDocTitle">Carga foto de documento</h5>
                  </header>
                  <div class="document-upload-container">
                    <div class="upload-box" id="front-upload">
                      <input type="file" id="front-file" accept="image/*" onchange="multiStep.handleImageUpload(event, 'front')">
                      <img id="front-preview" alt="Frente del documento">
                      <div class="upload-placeholder">
                        <div class="upload-icon">📄</div>
                        <p class="small mb-0 text-white" data-i18n="FrontDoc">Frente del documento</p>
                        <p class="small text-white" data-i18n="ClickToUpload">Click para cargar</p>
                      </div>
                      <button type="button" class="remove-image" onclick="multiStep.removeImage('front')">×</button>
                    </div>

                    <div class="upload-box" id="back-upload">
                      <input type="file" id="back-file" accept="image/*" onchange="multiStep.handleImageUpload(event, 'back')">
                      <img id="back-preview" alt="Reverso del documento">
                      <div class="upload-placeholder">
                        <div class="upload-icon">📄</div>
                        <p class="small mb-0 text-white" data-i18n="BackDoc">Reverso del documento</p>
                        <p class="small text-white" data-i18n="ClickToUpload">Click para cargar</p>
                      </div>
                      <button type="button" class="remove-image" onclick="multiStep.removeImage('back')">×</button>
                    </div>
                  </div>

                  <p class="small text-white text-center mt-3" data-i18n="FileFormatInfo">
                    Solo puedes cargar máximo 2 archivos, en formato JPG o PNG
                  </p>

                  <div class="w-50 d-flex flex-column mx-auto gap-3 flex-wrap mt-4">
                    <button type="button" class="btn btn-dark rounded-5 w-100" onclick="multiStep.saveImages()" data-i18n="SaveImagesButton">
                      Guardar imágenes
                    </button>
                    <div class="px-4">
                      <button type="button" class="btn btn-outline-dark rounded-5 w-100" onclick="multiStep.prevStep()" data-i18n="BackButton">
                        Atrás
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Step 3: Códigos -->
              <div class="step-content" data-step="3">
                <header class="mb-4">
                  <h5 class="fw-bold lh-sm text-white mb-3" data-i18n="ValidationCodesTitle">Códigos de confirmación</h5>
                  <p class="fw-semibold lh-sm small text-white mb-2" data-i18n="ValidationCodesDescription">
                    Hemos enviado dos códigos de confirmación, uno a tu correo electrónico y otro a tu celular. Por favor, ingrésalos a continuación:
                  </p>
                </header>

                <div class="validation-container">
                  <div class="code-section mb-4">
                    <label class="text-white small mb-2" data-i18n="EmailCodeLabel">Código recibido en tu correo</label>
                    <div class="code-inputs-container" id="email-code">
                      <input type="text" maxlength="1" class="code-input" data-index="0">
                      <input type="text" maxlength="1" class="code-input" data-index="1">
                      <input type="text" maxlength="1" class="code-input" data-index="2">
                      <input type="text" maxlength="1" class="code-input" data-index="3">
                      <input type="text" maxlength="1" class="code-input" data-index="4">
                      <input type="text" maxlength="1" class="code-input" data-index="5">
                    </div>
                  </div>

                  <div class="code-section mb-4">
                    <label class="text-white small mb-2" data-i18n="PhoneCodeLabel">Código recibido en tu celular</label>
                    <div class="code-inputs-container" id="phone-code">
                      <input type="text" maxlength="1" class="code-input" data-index="0">
                      <input type="text" maxlength="1" class="code-input" data-index="1">
                      <input type="text" maxlength="1" class="code-input" data-index="2">
                      <input type="text" maxlength="1" class="code-input" data-index="3">
                      <input type="text" maxlength="1" class="code-input" data-index="4">
                      <input type="text" maxlength="1" class="code-input" data-index="5">
                    </div>
                  </div>

                  <div class="resend-section text-center mb-4">
                    <div id="countdown-timer" class="countdown-timer">
                      <span class="countdown-number">60</span>
                      <span class="countdown-label text-white small">seg</span>
                    </div>
                    <button type="button" id="resend-code-btn" class="btn btn-link text-white small" disabled onclick="multiStep.resendCode()">
                      <span data-i18n="ResendCodeText">Solicita un nuevo código</span>
                    </button>
                  </div>

                  <div class="w-50 d-flex flex-column mx-auto gap-3 flex-wrap">
                    <button type="button" class="btn btn-warning rounded-pill w-100" onclick="multiStep.validateCodes()" data-i18n="ActivateAccountButton">
                      Activar cuenta
                    </button>
                    <div class="px-4">
                      <button type="button" class="btn btn-outline-light rounded-pill w-100" onclick="multiStep.prevStep()" data-i18n="BackButton">
                        Atrás
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>`;
    }


    setupEvents() {
        // Configurar eventos de toggle password
        this.setupPasswordToggles();

        // Configurar cambios de segmento específicos para multi-step
        this.setupSegmentChanges();
    }

    setupPasswordToggles() {
        const toggleButtons = this.querySelectorAll('.btn-toggle-password');
        toggleButtons.forEach(btn => {
            btn.addEventListener('click', function () {
                const input = this.previousElementSibling;
                input.type = input.type === 'password' ? 'text' : 'password';
            });
        });
    }

    setupSegmentChanges() {
        const segmentInputs = this.querySelectorAll('input[name="segmentoR"]');
        segmentInputs.forEach(input => {
            input.addEventListener('change', function () {
                const valorSeleccionado = this.value;
                let placeholder = '';

                if (valorSeleccionado === 'fuerza_de_ventas') {
                    placeholder = zhopium.Language.login.KOFCodePlaceholder;
                    document.getElementById('b-name-ms')?.classList.add('d-none');
                    document.getElementById('b-address-ms')?.classList.add('d-none');
                    document.querySelector('#b-name-ms input')?.setAttribute('disabled', 'true');
                    document.querySelector('#b-address-ms input')?.setAttribute('disabled', 'true');
                } else if (valorSeleccionado === 'clientes') {
                    placeholder = zhopium.Language.login.CustomerCodePlaceholder;
                    document.getElementById('b-name-ms')?.classList.remove('d-none');
                    document.getElementById('b-address-ms')?.classList.remove('d-none');
                    document.querySelector('#b-name-ms input')?.removeAttribute('disabled');
                    document.querySelector('#b-address-ms input')?.removeAttribute('disabled');
                }

                const codigoInput = document.querySelector('#codigo-input-container-r-ms input');
                if (codigoInput) {
                    codigoInput.placeholder = placeholder;
                }
            });
        });
    }

    showValidationFieldsInHost() {
        const hostForm = document.getElementById('register-form');
        if (!hostForm) return;

        // Mostrar tipo de documento
        const docTypeField = hostForm.querySelector('#document-type-field');
        if (docTypeField) {
            docTypeField.style.display = '';
        }

        // Mostrar fecha de nacimiento
        const birthDateField = hostForm.querySelector('#birthdate-field');
        if (birthDateField) {
            birthDateField.style.display = '';
        }

        // Configurar validación de edad mínima (18 años)
        const birthDateInput = hostForm.querySelector('input[name="BirthDate"]');
        if (birthDateInput && !birthDateInput.dataset.validationSet) {
            birthDateInput.dataset.validationSet = '1'; // Evitar duplicar listeners

            // Calcular fecha máxima (hace 18 años)
            const today = new Date();
            const maxDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
            const maxDateStr = maxDate.toISOString().split('T')[0];

            birthDateInput.setAttribute('max', maxDateStr);

            // Validación adicional en tiempo real
            birthDateInput.addEventListener('change', function () {
                const selectedDate = new Date(this.value);
                const eighteenYearsAgo = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());

                if (selectedDate > eighteenYearsAgo) {
                    this.setCustomValidity('Debes ser mayor de 18 años');
                } else {
                    this.setCustomValidity('');
                }
            });
        }
    }

    disconnectedCallback() {
        // Limpiar eventos si es necesario
    }
}

customElements.define('register-form-multistep', RegisterFormMultiStep);