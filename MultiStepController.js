class MultiStepController extends HTMLElement {
    static get observedAttributes() {
        return ['host-form', 'scope'];
    }

    constructor() {
        super();
        // Estado
        this.currentStep = 1;
        this.totalSteps = 3;
        this.images = { front: null, back: null };
        this.initialized = false;
        this.countdownInterval = null;
        // **NUEVO: Datos del flujo de registro**
        this.userData = null;
        this.userId = null;
        this.transactionId = null;
        this.registerState = null;
        this.isValidationMode = false; // **NUEVO: Flag para modo validación**

        // Seletores configurables
        this.sel = {
            progress: '.step-progress',
            stepContent: '.step-content',
            uploadInstructions: '#upload-instructions',
            uploadFields: '#upload-fields',
            codeInput: '.code-input',
            emailCodeBox: '#email-code',
            phoneCodeBox: '#phone-code',
            countdownNumber: '.countdown-number',
            resendBtn: '#resend-code-btn',
            front: { box: '#front-upload', file: '#front-file', preview: '#front-preview' },
            back: { box: '#back-upload', file: '#back-file', preview: '#back-preview' },
        };

        // Enlaces públicos (para compatibilidad hacia atrás)
        this.publicAPI = {
            init: this.init.bind(this),
            nextStep: this.nextStep.bind(this),
            prevStep: this.prevStep.bind(this),
            goToStep: this.goToStep.bind(this),
            updateSteps: this.updateSteps.bind(this),
            validateCurrentStep: this.validateCurrentStep.bind(this),
            handleImageUpload: this.handleImageUpload.bind(this),
            removeImage: this.removeImage.bind(this),
            saveImages: this.saveImages.bind(this),
            reset: this.reset.bind(this),
            showUploadFields: this.showUploadFields.bind(this),
            resendCode: this.resendCode.bind(this),
            validateCodes: this.validateCodes.bind(this),
            setupCodeInputs: this.setupCodeInputs.bind(this),
            getCodeFromInputs: this.getCodeFromInputs.bind(this),
            startCountdown: this.startCountdown.bind(this),
            // **NUEVO: Métodos del flujo de registro**
            validateUserData: this.validateUserData.bind(this),
            saveDocuments: this.saveDocuments.bind(this),
            requestOTPCodes: this.requestOTPCodes.bind(this),
            confirmOTPCodes: this.confirmOTPCodes.bind(this),
            resendOTPCodes: this.resendOTPCodes.bind(this),
            continueValidation: this.continueValidation.bind(this),
        };
    }

    // Atributos
    get hostFormSelector() { return this.getAttribute('host-form') || '#register-form'; }
    get scopeSelector() { return this.getAttribute('scope') || 'document'; }

    get scopeRoot() {
        if (this.scopeSelector === 'document') return document;
        const el = document.querySelector(this.scopeSelector);
        return el || document;
    }

    attributeChangedCallback() {
        // nada por ahora
    }

    connectedCallback() {
        // Delegación para abrir diálogos de archivos (funciona aunque el DOM se pinte después)
        this._onDocClick = (e) => {
            const box = e.target.closest('.upload-box');
            if (!box) return;
            if (e.target.closest('.remove-image')) return;

            let side = box.id.startsWith('front') ? 'front' : (box.id.startsWith('back') ? 'back' : null);
            if (!side) return;

            const input = this.scopeRoot.querySelector(this.sel[side].file);
            if (input) input.click();
        };
        document.addEventListener('click', this._onDocClick);

        // Exponer API global (retrocompatibilidad con tus inline handlers)
        window.multiStep = this.publicAPI;

        // Bridge para el botón "Siguiente" del host
        window.MultiStepBridge = {
            goToStep2FromHost: function () {
                const hostForm = document.querySelector(this.hostFormSelector);
                if (!hostForm) return;

                // Validar formulario HTML5
                const disabledInputs = hostForm.querySelectorAll('input:disabled');
                disabledInputs.forEach(i => {
                    i.disabled = false;
                    i.setAttribute('data-was-disabled', '1');
                });

                const ok = hostForm.checkValidity();
                if (!ok) {
                    hostForm.reportValidity();
                    disabledInputs.forEach(i => {
                        if (i.getAttribute('data-was-disabled')) {
                            i.disabled = true;
                            i.removeAttribute('data-was-disabled');
                        }
                    });
                    return;
                }

                // Restaurar disabled
                disabledInputs.forEach(i => {
                    if (i.getAttribute('data-was-disabled')) {
                        i.disabled = true;
                        i.removeAttribute('data-was-disabled');
                    }
                });

                const formData = new FormData(hostForm);
                const userData = Object.fromEntries(formData.entries());
                
                this.validateUserData(
                    userData,
                    (response) => {
                        hostForm.classList.add('d-none');
                        const comp = document.querySelector('register-form-multistep');
                        if (comp) comp.style.display = 'block';
                        this.goToStep(2);
                    },
                    (error) => {
                        console.error('Error en validación:', error);
                    }
                );
            }.bind(this)
        };

        // Si quieres inicializar al montar:
        // this.init();
    }

    disconnectedCallback() {
        document.removeEventListener('click', this._onDocClick);
        if (this.countdownInterval) clearInterval(this.countdownInterval);
    }

    /* ----------------- LÓGICA ----------------- */

    init() {
        this.currentStep = 1;
        this.initialized = true;
        this.updateSteps();
    }

    nextStep() {
        if (!this.validateCurrentStep()) return;
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateSteps();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateSteps();

            if (this.currentStep === 1) {
                const hostForm = document.querySelector(this.hostFormSelector);
                if (hostForm) hostForm.classList.remove('d-none');

                const comp = document.querySelector('register-form-multistep');
                if (comp) comp.style.display = 'none';

                this.updateSteps();
            }
        }
    }

    goToStep(step) {
        this.currentStep = step;
        this.updateSteps();
    }

    updateSteps() {
        // Progress bars
        this.scopeRoot.querySelectorAll(this.sel.progress).forEach(bar => {
            bar.querySelectorAll('.step-item').forEach((item, idx) => {
                const stepNum = idx + 1;
                item.classList.remove('active', 'completed');
                if (stepNum === this.currentStep) item.classList.add('active');
                else if (stepNum < this.currentStep) item.classList.add('completed');
            });
        });

        // Contenidos
        this.scopeRoot.querySelectorAll(this.sel.stepContent).forEach(content => {
            const stepNum = parseInt(content.dataset.step);
            if (stepNum === this.currentStep) {
                content.classList.add('active');
                if (stepNum === 3) {
                    this.setupCodeInputs();
                    this.startCountdown();
                }
            } else {
                content.classList.remove('active');
            }
        });
    }

    validateCurrentStep() {
        if (this.currentStep === 1) {
            const form = document.querySelector(this.hostFormSelector);
            if (!form) return false;

            const disabledInputs = form.querySelectorAll('input:disabled');
            disabledInputs.forEach(i => {
                i.disabled = false;
                i.setAttribute('data-was-disabled', '1');
            });

            const ok = form.checkValidity();
            if (!ok) {
                form.reportValidity();
                disabledInputs.forEach(i => {
                    if (i.getAttribute('data-was-disabled')) {
                        i.disabled = true;
                        i.removeAttribute('data-was-disabled');
                    }
                });
                return false;
            }

            // Restaurar disabled
            disabledInputs.forEach(i => {
                if (i.getAttribute('data-was-disabled')) {
                    i.disabled = true;
                    i.removeAttribute('data-was-disabled');
                }
            });

            // **NUEVO: No retornar true, dejar que validateUserData maneje el avance**
            return false; // El servidor decidirá si avanzamos
        }

        if (this.currentStep === 2) {
            if (!this.images.front || !this.images.back) {
                alert('Debes cargar ambas imágenes del documento');
                return false;
            }
            return true;
        }

        return true;
    }

    handleImageUpload(event, side) {
        const file = event.target.files?.[0];
        if (!file) return;

        const validTypes = ['image/jpeg', 'image/jpg', 'image/png']; // ajusta si permites PDF/DOC
        if (!validTypes.includes(file.type)) {
            alert('Solo se permiten imágenes JPG o PNG');
            event.target.value = '';
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('La imagen no debe superar 5MB');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.images[side] = e.target.result;
            const preview = this.scopeRoot.querySelector(this.sel[side].preview);
            const box = this.scopeRoot.querySelector(this.sel[side].box);
            if (preview) preview.src = e.target.result;
            if (box) box.classList.add('has-image');
        };
        reader.readAsDataURL(file);
    }

    removeImage(side) {
        this.images[side] = null;
        const preview = this.scopeRoot.querySelector(this.sel[side].preview);
        const box = this.scopeRoot.querySelector(this.sel[side].box);
        const input = this.scopeRoot.querySelector(this.sel[side].file);
        if (preview) preview.src = '';
        if (box) box.classList.remove('has-image');
        if (input) input.value = '';
    }

    saveImages() {
        if (!this.images.front || !this.images.back) {
            alert('Debes cargar ambas imágenes del documento');
            return;
        }

        // Mostrar loading
        this.showDocumentLoading(true);

        this.saveDocuments(
            this.images.front,
            this.images.back,
            (response) => {
                this.requestOTPCodes(
                    (transactionId, message) => {
                        // Ocultar loading
                        this.showDocumentLoading(false);
                        this.nextStep();
                    },
                    (error) => {
                        console.error('Error al solicitar OTP:', error);
                        // Ocultar loading en caso de error
                        this.showDocumentLoading(false);
                    }
                );
            },
            (error) => {
                console.error('Error al guardar documentos:', error);
                // Ocultar loading en caso de error
                this.showDocumentLoading(false);
            }
        );
    }

    showDocumentLoading(show) {
        const modalId = 'documentLoadingModal';
        let loadingModal = document.getElementById(modalId);

        if (show) {
            // Limpiar cualquier modal anterior
            if (loadingModal) {
                loadingModal.remove();
            }

            // Crear modal nuevo
            const modalHTML = `
            <div class="modal fade" id="${modalId}" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-body text-center py-5">
                            <div class="spinner-border text-primary mb-3" role="status" style="width: 3rem; height: 3rem;">
                                <span class="visually-hidden">Cargando...</span>
                            </div>
                            <h5 class="mb-2">Procesando documentos...</h5>
                            <p class="text-muted small">Por favor espere, esto puede tomar unos momentos</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            loadingModal = document.getElementById(modalId);

            // Mostrar modal
            const modal = new bootstrap.Modal(loadingModal);
            modal.show();

        } else {
            // Ocultar y eliminar modal completamente
            if (loadingModal) {
                const modal = bootstrap.Modal.getInstance(loadingModal);
                if (modal) {
                    modal.hide();
                }

                // Esperar a que termine la animación y eliminar todo
                setTimeout(() => {
                    if (loadingModal && loadingModal.parentNode) {
                        loadingModal.remove();
                    }

                    // Limpiar backdrops huérfanos
                    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
                        backdrop.remove();
                    });

                    // Restaurar body
                    document.body.classList.remove('modal-open');
                    document.body.style.overflow = '';
                    document.body.style.paddingRight = '';
                }, 300);
            }
        }
    }

    reset() {
        this.currentStep = 1;
        this.initialized = false;
        this.images = { front: null, back: null };
        this.isValidationMode = false;

        const inst = this.scopeRoot.querySelector(this.sel.uploadInstructions);
        const fields = this.scopeRoot.querySelector(this.sel.uploadFields);
        if (inst) inst.style.display = 'block';
        if (fields) fields.style.display = 'none';

        ['front', 'back'].forEach(side => this.removeImage(side));

        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        this.scopeRoot.querySelectorAll(this.sel.codeInput).forEach(inp => {
            inp.value = ''; inp.classList.remove('filled', 'error');
        });

        const hostForm = document.querySelector(this.hostFormSelector);
        if (hostForm) {
            // Restaurar campos readonly
            hostForm.querySelectorAll('input[readonly]').forEach(input => {
                input.removeAttribute('readonly');
                input.style.backgroundColor = '';
                input.style.cursor = '';
            });

            // Mostrar campos de contraseña
            hostForm.querySelectorAll('[name="password"], [name="password2"]').forEach(field => {
                const parent = field.closest('.col-lg-6, .col-xs-12, .col-sm-12');
                if (parent) {
                    parent.style.display = '';
                }
            });

            // Mostrar segmento
            const segmentoOptions = hostForm.querySelector('.segmento-options');
            if (segmentoOptions) {
                segmentoOptions.style.display = 'flex';
            }

            // Mostrar términos
            const termsContainer = hostForm.querySelector('#terms')?.closest('.col-12');
            if (termsContainer) {
                termsContainer.style.display = '';
            }

            // Restaurar textos del header
            const headerTitle = hostForm.querySelector('header p[data-i18n="ContinueValidationTitle"]');
            if (headerTitle) {
                headerTitle.textContent = zhopium.Language?.login?.RegisterTitle ||
                    'Haz tu registro llenando los siguientes datos.';
                headerTitle.setAttribute('data-i18n', 'RegisterTitle');
            }

            const headerSubtitle = hostForm.querySelector('header p[data-i18n="ContinueValidationSubtitle"]');
            if (headerSubtitle) {
                headerSubtitle.textContent = zhopium.Language?.login?.RegisterSubtitle ||
                    'Debes ingresar tu Código sin puntos, espacios ni letras.';
                headerSubtitle.setAttribute('data-i18n', 'RegisterSubtitle');
            }

            // Ocultar campos de validación
            const docTypeField = hostForm.querySelector('#document-type-field');
            const birthDateField = hostForm.querySelector('#birthdate-field');
            if (docTypeField) docTypeField.style.display = 'none';
            if (birthDateField) birthDateField.style.display = 'none';
        }
    }

    showUploadFields() {
        const inst = this.scopeRoot.querySelector(this.sel.uploadInstructions);
        const fields = this.scopeRoot.querySelector(this.sel.uploadFields);
        if (inst) inst.style.display = 'none';
        if (fields) fields.style.display = 'block';
    }

    startCountdown() {
        let timeLeft = 60;
        const numberEl = this.scopeRoot.querySelector(this.sel.countdownNumber);
        const resendBtn = this.scopeRoot.querySelector(this.sel.resendBtn);
        if (!numberEl || !resendBtn) return;

        resendBtn.disabled = true;
        if (this.countdownInterval) clearInterval(this.countdownInterval);

        this.countdownInterval = setInterval(() => {
            timeLeft--;
            numberEl.textContent = String(timeLeft);
            if (timeLeft <= 0) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
                resendBtn.disabled = false;
            }
        }, 1000);
    }

    resendCode() {
        this.resendOTPCodes(
            (transactionId, message) => {
                console.log('Códigos reenviados exitosamente');
            },
            (error) => {
                console.error('Error al reenviar códigos:', error);
            }
        );
    }

    validateCodes() {
        const emailCode = this.getCodeFromInputs(this.sel.emailCodeBox);
        const phoneCode = this.getCodeFromInputs(this.sel.phoneCodeBox);

        if (emailCode.length !== 6 || phoneCode.length !== 6) {
            alert('Por favor completa ambos códigos de 6 dígitos');
            return;
        }

        this.confirmOTPCodes(
            emailCode,
            phoneCode,
            (response) => {
                console.log('¡Registro completado!');
            },
            (error) => {
                console.error('Error al confirmar códigos:', error);
                this.scopeRoot.querySelectorAll(this.sel.codeInput).forEach(inp => {
                    inp.classList.add('error');
                });
            }
        );
    }

    getCodeFromInputs(containerSel) {
        const inputs = this.scopeRoot.querySelectorAll(`${containerSel} ${this.sel.codeInput}`);
        let code = '';
        inputs.forEach(i => code += i.value);
        return code;
    }

    setupCodeInputs() {
        this.scopeRoot.querySelectorAll(this.sel.codeInput).forEach(input => {
            // Evitar múltiples bindings
            if (input.dataset.msBound) return;
            input.dataset.msBound = '1';

            input.addEventListener('input', (e) => {
                const v = e.target.value;
                if (!/^\d*$/.test(v)) { e.target.value = ''; return; }
                if (v) {
                    e.target.classList.add('filled'); e.target.classList.remove('error');
                    const container = e.target.closest('.code-inputs-container');
                    const idx = parseInt(e.target.dataset.index);
                    const next = container?.querySelectorAll('.code-input')?.[idx + 1];
                    next?.focus();
                } else {
                    e.target.classList.remove('filled');
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value) {
                    const container = e.target.closest('.code-inputs-container');
                    const idx = parseInt(e.target.dataset.index);
                    const prev = container?.querySelectorAll('.code-input')?.[idx - 1];
                    prev?.focus();
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const digits = e.clipboardData.getData('text').replace(/\D/g, '');
                const container = e.target.closest('.code-inputs-container');
                const inputs = container?.querySelectorAll('.code-input') || [];
                for (let i = 0; i < Math.min(digits.length, inputs.length); i++) {
                    inputs[i].value = digits[i];
                    inputs[i].classList.add('filled');
                }
            });
        });
    }

    /* ----------------- FLUJO DE REGISTRO MULTI-STEP ----------------- */

    validateUserData(formData, onSuccess, onError) {
        // **NUEVO: Mostrar modal de confirmación ANTES de enviar**
        this.showConfirmDataModal(formData, () => {
            // Una vez confirmado, proceder con la validación
            var finalPayload = {
                user: {
                    ...formData,
                    Campaign: zhopium.Campaign
                }
            };

            zhopium.Post(
                'userchannels/userchannel1',
                'ValidateRegister',
                finalPayload,
                (response) => {
                    if (response.Success) {
                        this.userData = formData;
                        this.userId = response.Data?.UserId;
                        this.registerState = response.Data;
                        console.log('RegisterState:', response.Data);

                        const blockedStates = ['En Validación', 'Bloqueado', 'Eliminado'];
                        const stateName = response.Data?.StateName;

                        if (blockedStates.includes(stateName)) {
                            zoftinium.DisplayInfo(response.Message || `Su cuenta está en estado: ${stateName}`);
                            setTimeout(() => {
                                if (typeof signin !== 'undefined') {
                                    signin.toggleForm('login-form');
                                }
                            }, 2000);
                            if (onError) onError(response);
                            return;
                        }

                        if (onSuccess) onSuccess(response);
                    } else {
                        zoftinium.DisplayInfo(response.Message || 'Error al validar los datos');
                        if (onError) onError(response);
                    }
                },
                (error) => {
                    zoftinium.DisplayInfo('Error de conexión al validar usuario');
                    if (onError) onError(error);
                }
            );
        });
    }

    showConfirmDataModal(formData, onConfirm) {
        const modalElement = document.getElementById('confirmDataModal');
        if (!modalElement) {
            console.error('Modal de confirmación no encontrado');
            return;
        }

        // Llenar datos en el modal
        const emailSpan = document.getElementById('modal-email');
        const phoneSpan = document.getElementById('modal-phone');

        if (emailSpan) emailSpan.textContent = formData.mail || '';
        if (phoneSpan) phoneSpan.textContent = formData.cellPhone || '';

        // Crear instancia del modal
        const modal = new bootstrap.Modal(modalElement);

        // Configurar el botón de confirmar
        const confirmBtn = document.getElementById('confirm-data-btn');

        // Remover listeners anteriores
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        // Agregar nuevo listener
        newConfirmBtn.addEventListener('click', () => {
            modal.hide();
            // Esperar a que se cierre el modal antes de continuar
            modalElement.addEventListener('hidden.bs.modal', () => {
                if (onConfirm) onConfirm();
            }, { once: true });
        });

        // Mostrar modal
        modal.show();
    }

    saveDocuments(frontImage, backImage, onSuccess, onError) {
        if (!this.userId) {
            zoftinium.DisplayInfo('No se encontró el ID de usuario');
            if (onError) onError({ Message: 'UserId no disponible' });
            return;
        }
        if (!frontImage || !backImage) {
            zoftinium.DisplayInfo('Debe cargar ambas imágenes del documento');
            if (onError) onError({ Message: 'Imágenes incompletas' });
            return;
        }

        console.log('Paso 2: Guardando documentos...');

        // Construir FileObject[] según lo que espera el backend
        const files = [
            {
                FileId: this.generateGuid(),
                FileName: 'document_front.jpg',
                FileType: 'image/jpeg',
                FileData: null,
                FileStream: frontImage.split(',')[1]
            },
            {
                FileId: this.generateGuid(),
                FileName: 'document_back.jpg',
                FileType: 'image/jpeg',
                FileData: null,
                FileStream: backImage.split(',')[1]
            }
        ];

        const payload = {
            userId: this.userId,
            files: files
        };

        console.log('Payload being sent:', payload);

        zhopium.Post(
            'userchannels/userchannel1',
            'SaveIdentityDocument',
            payload,
            (response) => {
                if (response.Success) {
                    console.log('Documentos guardados exitosamente');
                    if (onSuccess) onSuccess(response);
                } else {
                    zoftinium.DisplayInfo(response.Message || 'Error al guardar documentos');
                    if (onError) onError(response);
                }
            },
            (error) => {
                zoftinium.DisplayInfo('Error de conexión al guardar documentos');
                if (onError) onError(error);
            }
        );
    }

    // Función auxiliar para generar GUID
    generateGuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    requestOTPCodes(onSuccess, onError) {
        if (!this.userData) {
            zoftinium.DisplayInfo('No se encontraron los datos del usuario');
            if (onError) onError({ Message: 'UserData no disponible' });
            return;
        }

        console.log('Paso 3A: Solicitando códigos OTP...');

        const transactionId = this.generateGuid();

        const payload = {
            userId: this.userId,
            otp: {
                TransactionId: transactionId,
                Code: "",
                Purpose: 'Registration'
            }
        };

        console.log('Payload OTP Request:', JSON.stringify(payload, null, 2));

        zoftinium.PostJson(
            '/shop/AnonymAuthTransaction/RequestOTPForTransaction',
            payload,
            (otpResponse) => {
                if (otpResponse.Success) {
                    this.transactionId = transactionId;
                    console.log('Códigos OTP enviados exitosamente');
                    if (onSuccess) onSuccess(transactionId, otpResponse.Message);
                } else {
                    if (otpResponse.Data === "NOT_REQUIRED") {
                        console.log('OTP no requerido, completando registro...');
                        this.completeRegistrationWithoutOTP(onSuccess, onError);
                    } else {
                        zoftinium.DisplayInfo(otpResponse.Message || 'Error al solicitar códigos');
                        if (onError) onError(otpResponse);
                    }
                }
            },
            (error) => {
                zoftinium.DisplayInfo('Error de conexión al solicitar OTP');
                if (onError) onError(error);
            }
        );
    }

    confirmOTPCodes(emailCode, phoneCode, onSuccess, onError) {
        if (!this.userId) {
            zoftinium.DisplayInfo('No se encontró el ID de usuario');
            if (onError) onError({ Message: 'UserId no disponible' });
            return;
        }
        if (!this.transactionId) {
            zoftinium.DisplayInfo('No se encontró el Transaction ID');
            if (onError) onError({ Message: 'TransactionId no disponible' });
            return;
        }
        if (emailCode.length !== 6 || phoneCode.length !== 6) {
            zoftinium.DisplayInfo('Por favor ingrese ambos códigos completos (6 dígitos)');
            return;
        }

        console.log('Paso 3B: Confirmando códigos OTP...');


        const payload = {
            userId: this.userId,
            otp: {
                TransactionId: this.transactionId,
                CodeMail: emailCode,
                CodeSms: phoneCode,
                Purpose: 'Registration'
            }
        };

        console.log('Payload OTP Confirm:', payload);

        zhopium.Post(
            'userchannels/userchannel1',
            'ConfirmAccountRegister',
            payload,
            (response) => {
                if (response.Success) {
                    console.log('¡Registro completado exitosamente!');
                    zoftinium.DisplayInfo(response.Message || '¡Cuenta activada exitosamente!');
                    this.resetRegistrationData();
                    if (onSuccess) onSuccess(response);
                    setTimeout(() => {
                        if (typeof signin !== 'undefined') {
                            signin.toggleForm('login-form');
                        }
                    }, 2000);
                } else {
                    zoftinium.DisplayInfo(response.Message || 'Código incorrecto. Intente nuevamente');
                    if (onError) onError(response);
                }
            },
            (error) => {
                zoftinium.DisplayInfo('Error de conexión al confirmar códigos');
                if (onError) onError(error);
            }
        );
    }

    resendOTPCodes(onSuccess, onError) {
        console.log('Reenviando códigos OTP...');

        const emailInputs = this.scopeRoot.querySelectorAll(`${this.sel.emailCodeBox} ${this.sel.codeInput}`);
        const phoneInputs = this.scopeRoot.querySelectorAll(`${this.sel.phoneCodeBox} ${this.sel.codeInput}`);

        emailInputs.forEach(inp => {
            inp.value = '';
            inp.classList.remove('filled', 'error');
        });

        phoneInputs.forEach(inp => {
            inp.value = '';
            inp.classList.remove('filled', 'error');
        });

        if (emailInputs[0]) emailInputs[0].focus();

        this.requestOTPCodes(
            (transactionId, message) => {
                zoftinium.DisplayInfo(message || 'Códigos reenviados exitosamente');
                this.startCountdown();
                if (onSuccess) onSuccess(transactionId, message);
            },
            (error) => {
                zoftinium.DisplayInfo('Error al reenviar códigos');
                if (onError) onError(error);
            }
        );
    }

    completeRegistrationWithoutOTP(onSuccess, onError) {
        console.log('Completando registro sin OTP...');

        zoftinium.DisplayInfo('¡Registro completado exitosamente!');

        this.resetRegistrationData();

        if (onSuccess) onSuccess({ Success: true, Message: 'Registro sin OTP' });

        setTimeout(() => {
            if (typeof signin !== 'undefined') {
                signin.toggleForm('login-form');
            }
        }, 2000);
    }

    resetRegistrationData() {
        this.userData = null;
        this.userId = null;
        this.transactionId = null;
        this.registerState = null;
        this.isValidationMode = false;
        console.log('Datos de registro limpiados');
    }

    /* ----------------- MODO VALIDACIÓN (desde Login) ----------------- */

    continueValidation(userData) {
        console.log('Continuando validación para usuario:', userData);

        this.isValidationMode = true;
        this.userId = userData.UserId;

        // Guardar todos los datos del usuario
        this.userData = {
            document: userData.Document,
            mail: userData.Mail,
            cellPhone: userData.CellPhone,
            names: userData.Names,
            businessName: userData.BusinessName,
            address: userData.Address,
            gender: userData.Gender,
            personalize1: userData.Personalize1, // Segmento
        };

        this.updateHeaderForValidation();

        // Mostrar campos adicionales de validación
        this.showValidationFields();

        this.prefillHostFormWithUserData(userData);

        // Ocultar formulario de login
        const loginForm = document.querySelector('#login-form');
        if (loginForm) {
            loginForm.classList.add('d-none');
        }

        // Mostrar formulario de registro (que ya tiene datos pre-llenados)
        const hostForm = document.querySelector(this.hostFormSelector);
        if (hostForm) {
            hostForm.classList.remove('d-none');
        }

        // Ocultar componente multi-step inicialmente
        const comp = document.querySelector('register-form-multistep');
        if (comp) {
            comp.style.display = 'none';
        }

        // Ir al paso 1 (confirmación de datos)
        this.goToStep(1);

        // Mensaje informativo
        //const mensaje = zhopium.Language?.login?.ValidationRequiredAlert ||
        //    'Por favor, confirme sus datos para continuar con la validación';
        //zoftinium.DisplayInfo(mensaje);
    }

    prefillHostFormWithUserData(userData) {
        const hostForm = document.querySelector(this.hostFormSelector);
        if (!hostForm) {
            console.error('No se encontró el formulario host');
            return;
        }

        console.log('Pre-llenando formulario con datos:', userData);

        // 1. Ocultar selector de segmento
        //const segmentoOptions = hostForm.querySelector('.segmento-options');
        //if (segmentoOptions) {
        //    segmentoOptions.style.display = 'none';
        //}

        // 2. Determinar y seleccionar segmento basado en Personalize1
        let segmento = 'clientes'; // Por defecto
        if (userData.Personalize1) {
            segmento = userData.Personalize1.toLowerCase().includes('off') ? 'fuerza_de_ventas' : 'clientes';
        }

        const segmentoInput = hostForm.querySelector(`input[name="segmentoR"][value="${segmento}"]`);
        if (segmentoInput) {
            segmentoInput.checked = true;
            // Disparar evento change para que se ejecute la lógica de mostrar/ocultar campos
            segmentoInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // 3. Pre-llenar campos del formulario
        const fieldsMap = {
            'document': userData.Document,
            'mail': userData.Mail,
            'confirmMail': userData.Mail,
            'cellPhone': userData.CellPhone,
            'BusinessName': userData.BusinessName || '',
            'Address': userData.Address || '',
            'Gender': userData.Gender || '',
            'DocumentType': userData.DocumentType || 'CC',
            'BirthDate': userData.BirthDate || ''
        };

        // Llenar campos
        Object.keys(fieldsMap).forEach(fieldName => {
            const input = hostForm.querySelector(`[name="${fieldName}"]`);
            if (input && fieldsMap[fieldName]) {
                input.value = fieldsMap[fieldName];

                // Hacer readonly los campos críticos que no deben cambiar
                //if (['document', 'mail', 'confirmMail'].includes(fieldName)) {
                //    input.setAttribute('readonly', 'true');
                //    input.style.backgroundColor = '#f0f0f0';
                //    input.style.cursor = 'not-allowed';
                //}
            }
        });

        // 4. Seleccionar género si viene
        if (userData.Gender) {
            const genderSelect = hostForm.querySelector('[name="Gender"]');
            if (genderSelect) {
                genderSelect.value = userData.Gender;
            }
        }

        // 5. Ocultar campos de contraseña 
        //const passwordFields = hostForm.querySelectorAll('[name="password"], [name="password2"]');
        //passwordFields.forEach(field => {
        //    const parent = field.closest('.col-lg-6, .col-xs-12, .col-sm-12');
        //    if (parent) {
        //        parent.style.display = 'none';
        //    }
        //});


        console.log('Formulario pre-llenado completamente');
    }

    updateHeaderForValidation() {
        const hostForm = document.querySelector(this.hostFormSelector);
        console.log('🔍 1. hostForm encontrado:', hostForm);

        if (!hostForm) return;

        const header = hostForm.querySelector('header');
        console.log('🔍 2. header encontrado:', header);
        console.log('🔍 3. HTML del header:', header ? header.innerHTML : 'NO ENCONTRADO');

        const allParagraphs = hostForm.querySelectorAll('header > p');
        console.log('🔍 4. Párrafos encontrados:', allParagraphs.length);

        allParagraphs.forEach((p, index) => {
            console.log(`🔍 5.${index} Párrafo:`, p);
            console.log(`🔍 5.${index} data-i18n:`, p.getAttribute('data-i18n'));
            console.log(`🔍 5.${index} textContent:`, p.textContent);
        });

        // Intentar encontrar por data-i18n
        const titleByAttr = hostForm.querySelector('header p[data-i18n="RegisterTitle"]');
        const subtitleByAttr = hostForm.querySelector('header p[data-i18n="RegisterSubtitle"]');

        console.log('🔍 6. Title encontrado:', titleByAttr);
        console.log('🔍 7. Subtitle encontrado:', subtitleByAttr);

        if (titleByAttr) {
            titleByAttr.textContent = 'Su cuenta requiere validación.';
            titleByAttr.setAttribute('data-i18n', 'ContinueValidationTitle');
            console.log('✅ Title actualizado');
        } else {
            console.log('❌ NO SE PUDO ACTUALIZAR EL TITLE');
        }

        if (subtitleByAttr) {
            subtitleByAttr.textContent = 'Por favor, confirma tus datos para continuar';
            subtitleByAttr.setAttribute('data-i18n', 'ContinueValidationSubtitle');
            console.log('✅ Subtitle actualizado');
        } else {
            console.log('❌ NO SE PUDO ACTUALIZAR EL SUBTITLE');
        }
    }

    showValidationFields() {
        const hostForm = document.querySelector(this.hostFormSelector);
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
        if (birthDateInput) {
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

}
customElements.define('multi-step-controller', MultiStepController);
