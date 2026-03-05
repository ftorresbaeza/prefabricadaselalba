/**
 * alba-chat.js — Widget de chat IA para Casas Prefabricadas El Alba
 * Asistente "Alba" impulsada por Groq (llama-3.1-8b-instant)
 *
 * MODOS DE OPERACIÓN:
 *   1. Producción (servidor PHP): las llamadas a Groq van por api/chat.php (seguro, clave en servidor)
 *   2. Local / file:// (desarrollo): fallback directo a Groq desde el browser
 *      Para activar el modo local, define antes de cargar este script:
 *      <script>window.AlbaChatConfig = { groqKey: 'gsk_...' };</script>
 */
(function () {
  'use strict';

  // ─── Configuración ──────────────────────────────────────────────────────────
  const _ext = window.AlbaChatConfig || {};
  const CFG = {
    apiUrl:          _ext.apiUrl        || 'api/chat.php',
    groqKey:         _ext.groqKey       || '',   // solo para dev local
    groqModel:       'llama-3.1-8b-instant',
    groqUrl:         'https://api.groq.com/openai/v1/chat/completions',
    storageKey:      'alba_chat_history',
    storageUserKey:  'alba_user_data',
    proactiveDelay:  30000, // 30 s
    waNumber:        '56931846889',
    maxHistory:      6,
    typingDuration:  { min: 600, max: 1400 }, // ms
  };

  // ─── System prompt para fallback browser-directo (dev local) ────────────────
  const SYSTEM_PROMPT_JS = `Eres "Alba", la asistente virtual de Casas Prefabricadas El Alba. Amable, experta, cercana. Respondes en español chileno. Sé concisa.

EMPRESA: Casas Prefabricadas El Alba · prefabricadaselalba.cl · San Bernardo, RM
WhatsApp: +56 9 3184 6889 (Lun-Vie 9-17 hrs) · Email: contacto@prefabricadaselalba.cl
Entrega a todo Chile. Llave en Mano incluye traslado hasta 150 km de Santiago.

CATÁLOGO 32 MODELOS — Precios CLP (sin IVA)
Formato: Modelo | Kit Autoconstrucción | Kit+Instalaciones | Llave en Mano
🏗️ MODERNO: 36m² $7.7M/$18.7M/$22M · 42m² $9M/$21.8M/$25.6M · 45.6m² $9.8M/$23.7M/$27.8M · 47m² $10.1M/$24.4M/$28.7M · 54m² $11.6M/$28M/$32.9M · 57m² $12.3M/$29.6M/$34.8M · 72m² $15.5M/$37.4M/$43.9M · 74m² $15.9M/$38.5M/$45.1M · 76m² $16.3M/$39.5M/$46.4M · 80m² $17.2M/$41.6M/$48.8M · 83m² $17.8M/$43.2M/$50.6M · 94m² $20.2M/$48.9M/$57.3M · 100m² $21.5M/$52M/$61M · 107m² $23M/$55.6M/$65.3M · 118m² $25.4M/$61.4M/$72M · 136m² $29.2M/$70.7M/$83M · 138m² $29.7M/$71.8M/$84.2M
🌊 MEDITERRÁNEA: 94m² $21.5M/$50.8M/$59.2M · 120m² $27.6M/$43.2M/$50.4M · 149m² $31.7M/$80.5M/$93.9M · 193m² $44.4M/$104.2M/$121.6M · 196m² $45.1M/$101.9M/$119.6M
🏡 AMERICANA: 120m² $25.8M/$62.4M/$73.2M · 139m² $29.9M/$72.3M/$84.8M · 140m² $30.1M/$72.8M/$85.4M · 191m² $41.1M/$99.3M/$116.5M
🏢 2 NIVELES: 117m² $30.3M/$49M/$59.8M
🏛️ TRADICIONAL: 130m² $28M/$67.6M/$79.3M · 134m² $28.8M/$69.7M/$81.7M · 141m² $30.3M/$73.3M/$86M · 149m² $28.8M/$69.7M/$81.7M
👑 COLONIAL: 255m² $58.7M/$132.6M/$155.6M

3 MODALIDADES:
🔧 KIT AUTOCONSTRUCCIÓN: Materiales prefabricados para que el cliente arme. NO incluye: armado, fundación, flete, electricidad, agua, alcantarillado, pinturas, cerámicos, artefactos. Pago: 50%+50%. Entrega: 7-10 días hábiles.
⚡ KIT + INSTALACIONES: Todo el kit anterior MÁS fundación radier, instalación eléctrica, agua, alcantarillado. NO incluye: pinturas, cerámicos, artefactos, empalmes.
🏠 LLAVE EN MANO: Todo lo anterior MÁS pinturas, cerámicos ($9.000/m²), artefactos baño/cocina, terraza pino Oregón. Traslado incluido hasta 150km.

FAQ: Precios sin IVA. Sin financiamiento propio. Visitas a fábrica por WhatsApp.

CAPTURA DE LEADS: Si el cliente da nombre + contacto (tel o email), incluye al final:
LEAD_CAPTURADO{"nombre":"...","contacto":"...","interes":"...","resumen":"..."}`;

  const QUICK_REPLIES = [
    { label: '📐 Ver precios por m²',          text: '¿Cuáles son los precios según los m² de la casa?' },
    { label: '🔧 ¿Qué incluye cada kit?',      text: '¿Qué diferencia hay entre Kit Autoconstrucción, Kit con Instalaciones y Llave en Mano?' },
    { label: '🚚 Entrega a todo Chile',         text: '¿Hacen envío a todo Chile? ¿Cómo funciona el despacho?' },
    { label: '🏠 Casa desde $10 millones',     text: 'Tengo un presupuesto de unos 10 millones, ¿qué modelo me recomiendan?' },
    { label: '📅 ¿Cuánto tarda la entrega?',   text: '¿Cuánto tiempo demora la producción y entrega de la casa?' },
    { label: '📋 Agendar visita',              text: 'Me gustaría agendar una visita o hablar con alguien del equipo.' },
  ];

  // ─── Estado ─────────────────────────────────────────────────────────────────
  let isOpen         = false;
  let isTyping       = false;
  let proactiveSent  = false;
  let leadCaptured   = false;
  let messages       = [];   // { role: 'user'|'assistant', content: '...' }
  let proactiveTimer = null;
  let userData       = null; // { nombre, telefono }

  // ─── Crear estilos ───────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* ── Variables ── */
    :root{
      --ac-teal:  #00C4A7;
      --ac-blue:  #3D6CB8;
      --ac-dark:  #1B3028;
      --ac-dark2: #243C30;
      --ac-light: #EEF8F4;
      --ac-border:#D4EDDF;
      --ac-txt:   #0C2018;
      --ac-sub:   #6E8C80;
      --ac-rad:   14px;
      --ac-shadow:0 8px 32px rgba(0,0,0,.22);
    }

    /* ── FAB (botón flotante) ── */
    #alba-fab{
      position:fixed; bottom:28px; left:28px; z-index:9998;
      width:58px; height:58px; border-radius:50%;
      background:linear-gradient(135deg,var(--ac-dark),var(--ac-teal));
      border:none; cursor:pointer;
      box-shadow:0 4px 20px rgba(0,196,167,.4);
      display:flex; align-items:center; justify-content:center;
      transition:transform .2s,box-shadow .2s;
      outline:none;
    }
    #alba-fab:hover{ transform:scale(1.08); box-shadow:0 6px 28px rgba(0,196,167,.55); }
    #alba-fab:active{ transform:scale(.96); }
    #alba-fab svg{ width:28px; height:28px; fill:none; stroke:#fff; stroke-width:2; stroke-linecap:round; }
    #alba-fab .ac-notif{
      position:absolute; top:-3px; right:-3px;
      width:18px; height:18px; border-radius:50%;
      background:#E53E3E; color:#fff; font-size:10px; font-weight:700;
      display:flex; align-items:center; justify-content:center;
      border:2px solid #fff; opacity:0; transform:scale(0);
      transition:opacity .3s, transform .3s;
    }
    #alba-fab .ac-notif.show{ opacity:1; transform:scale(1); }

    /* ── Proactive bubble ── */
    #alba-proactive{
      position:fixed; bottom:98px; left:28px; z-index:9997;
      background:#fff; border-radius:12px; padding:10px 14px;
      box-shadow:0 4px 16px rgba(0,0,0,.15);
      font-size:13px; color:var(--ac-txt); max-width:220px; line-height:1.4;
      border-left:3px solid var(--ac-teal);
      display:none; animation:ac-pop .3s ease;
    }
    #alba-proactive::after{
      content:''; position:absolute; bottom:-7px; left:20px;
      width:14px; height:7px;
      background:#fff;
      clip-path:polygon(0 0,100% 0,50% 100%);
    }
    #alba-proactive .ac-close-pro{
      position:absolute; top:4px; right:6px;
      background:none; border:none; cursor:pointer;
      font-size:14px; color:var(--ac-sub); line-height:1;
      padding:0; width:18px; height:18px;
      display:flex; align-items:center; justify-content:center;
    }

    /* ── Panel principal ── */
    #alba-panel{
      position:fixed; bottom:98px; left:28px; z-index:9999;
      width:360px; max-width:calc(100vw - 32px);
      height:520px; max-height:calc(100vh - 120px);
      background:#fff; border-radius:var(--ac-rad);
      box-shadow:var(--ac-shadow);
      display:flex; flex-direction:column; overflow:hidden;
      transform:scale(.9) translateY(20px); opacity:0; pointer-events:none;
      transform-origin:bottom left;
      transition:transform .25s cubic-bezier(.34,1.56,.64,1), opacity .2s ease;
    }
    #alba-panel.open{
      transform:scale(1) translateY(0); opacity:1; pointer-events:all;
    }

    /* ── Header ── */
    .ac-header{
      background:linear-gradient(135deg,var(--ac-dark),var(--ac-dark2) 60%,#1a4a38);
      padding:14px 16px; display:flex; align-items:center; gap:11px;
      flex-shrink:0;
    }
    .ac-avatar{
      width:40px; height:40px; border-radius:50%;
      background:linear-gradient(135deg,var(--ac-teal),var(--ac-blue));
      display:flex; align-items:center; justify-content:center;
      font-size:18px; flex-shrink:0;
      box-shadow:0 0 0 2px rgba(255,255,255,.2);
    }
    .ac-header-info{ flex:1; min-width:0; }
    .ac-header-name{ color:#fff; font-size:14px; font-weight:700; margin:0; }
    .ac-header-status{
      color:rgba(255,255,255,.65); font-size:11px; display:flex; align-items:center; gap:5px;
    }
    .ac-online-dot{
      width:7px; height:7px; border-radius:50%;
      background:#4ADE80; box-shadow:0 0 0 2px rgba(74,222,128,.3);
      flex-shrink:0;
    }
    .ac-header-btns{ display:flex; gap:6px; }
    .ac-hbtn{
      background:rgba(255,255,255,.12); border:none; cursor:pointer;
      width:30px; height:30px; border-radius:8px;
      color:#fff; font-size:14px; display:flex; align-items:center; justify-content:center;
      transition:background .2s; flex-shrink:0;
    }
    .ac-hbtn:hover{ background:rgba(255,255,255,.22); }

    /* ── Pantalla de registro ── */
    #ac-register{
      flex:1; display:flex; flex-direction:column;
      align-items:center; justify-content:center;
      padding:24px 20px; background:#fff;
      animation:ac-pop .3s ease;
    }
    /* #ac-register.hidden reemplazado por .ac-hidden global arriba */
    .ac-reg-icon{
      width:60px; height:60px; border-radius:50%;
      background:linear-gradient(135deg,var(--ac-teal),var(--ac-blue));
      display:flex; align-items:center; justify-content:center;
      font-size:26px; margin-bottom:16px;
      box-shadow:0 4px 16px rgba(0,196,167,.3);
    }
    .ac-reg-title{
      font-size:16px; font-weight:700; color:var(--ac-txt);
      margin:0 0 8px; text-align:center;
    }
    .ac-reg-subtitle{
      font-size:13px; color:var(--ac-sub); text-align:center;
      line-height:1.5; margin:0 0 22px;
    }
    .ac-reg-fields{
      width:100%; display:flex; flex-direction:column; gap:10px; margin-bottom:16px;
    }
    .ac-reg-field{
      position:relative;
    }
    .ac-reg-field-icon{
      position:absolute; left:12px; top:50%; transform:translateY(-50%);
      color:var(--ac-sub); font-size:13px; pointer-events:none;
    }
    .ac-reg-input{
      width:100%; padding:11px 14px 11px 36px;
      border:1.5px solid var(--ac-border); border-radius:10px;
      font-size:13.5px; color:var(--ac-txt); background:#fafdf9;
      outline:none; font-family:inherit;
      transition:border-color .2s, box-shadow .2s;
    }
    .ac-reg-input:focus{
      border-color:var(--ac-teal);
      box-shadow:0 0 0 3px rgba(0,196,167,.12);
      background:#fff;
    }
    .ac-reg-input::placeholder{ color:#aac4ba; }
    .ac-reg-btn{
      width:100%; padding:13px;
      background:linear-gradient(135deg,var(--ac-dark),var(--ac-teal));
      color:#fff; border:none; border-radius:10px;
      font-size:14px; font-weight:700; cursor:pointer;
      transition:opacity .2s, transform .15s; font-family:inherit;
      letter-spacing:.3px;
    }
    .ac-reg-btn:hover:not(:disabled){ opacity:.9; transform:translateY(-1px); }
    .ac-reg-btn:active:not(:disabled){ transform:scale(.98); }
    .ac-reg-btn:disabled{ opacity:.45; cursor:default; }
    .ac-reg-skip{
      margin-top:10px; text-align:center;
    }
    .ac-reg-skip button{
      background:none; border:none; color:var(--ac-sub);
      font-size:11.5px; cursor:pointer; font-family:inherit;
      text-decoration:underline; padding:0;
      transition:color .2s;
    }
    .ac-reg-skip button:hover{ color:var(--ac-txt); }
    .ac-reg-privacy{
      font-size:10.5px; color:#aac4ba; text-align:center;
      margin-top:10px; line-height:1.4;
    }

    /* ── Mensajes ── */
    .ac-messages{
      flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column;
      gap:10px; scroll-behavior:smooth;
    }
    .ac-messages::-webkit-scrollbar{ width:4px; }
    .ac-messages::-webkit-scrollbar-track{ background:transparent; }
    .ac-messages::-webkit-scrollbar-thumb{ background:var(--ac-border); border-radius:4px; }

    /* Burbujas */
    .ac-msg{ display:flex; gap:8px; animation:ac-pop .25s ease; max-width:100%; }
    .ac-msg.user{ flex-direction:row-reverse; }
    .ac-msg-avatar{
      width:28px; height:28px; border-radius:50%; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-size:13px; margin-top:2px;
    }
    .ac-msg.bot .ac-msg-avatar{
      background:linear-gradient(135deg,var(--ac-teal),var(--ac-blue));
    }
    .ac-msg.user .ac-msg-avatar{ display:none; }
    .ac-bubble{
      max-width:78%; padding:9px 13px; border-radius:var(--ac-rad);
      font-size:13.5px; line-height:1.55; word-break:break-word;
    }
    .ac-msg.bot .ac-bubble{
      background:var(--ac-light); color:var(--ac-txt);
      border-bottom-left-radius:4px;
    }
    .ac-msg.user .ac-bubble{
      background:linear-gradient(135deg,var(--ac-dark),var(--ac-dark2));
      color:#fff; border-bottom-right-radius:4px;
      text-align:right;
    }
    .ac-bubble strong{ font-weight:700; }
    .ac-bubble em{ font-style:italic; opacity:.8; }

    /* Indicador de escritura */
    .ac-typing .ac-bubble{
      background:var(--ac-light); padding:10px 14px;
      display:flex; align-items:center; gap:4px;
    }
    .ac-typing .ac-dot{
      width:7px; height:7px; border-radius:50%;
      background:var(--ac-sub); opacity:.5;
      animation:ac-bounce .9s infinite;
    }
    .ac-typing .ac-dot:nth-child(2){ animation-delay:.18s; }
    .ac-typing .ac-dot:nth-child(3){ animation-delay:.36s; }

    /* Banner de lead */
    .ac-lead-banner{
      background:linear-gradient(135deg,rgba(0,196,167,.12),rgba(61,108,184,.12));
      border:1px solid var(--ac-border); border-radius:10px;
      padding:10px 12px; font-size:12px; color:var(--ac-sub);
      text-align:center; margin:4px 0;
      animation:ac-pop .3s ease;
    }
    .ac-lead-banner strong{ color:var(--ac-teal); }

    /* Quick replies */
    .ac-quick-wrap{
      padding:0 14px 10px; display:flex; flex-wrap:wrap; gap:7px;
    }
    .ac-quick{
      background:#fff; border:1.5px solid var(--ac-border);
      border-radius:20px; padding:6px 12px; font-size:12px; color:var(--ac-txt);
      cursor:pointer; transition:background .2s, border-color .2s, color .2s;
      white-space:nowrap; max-width:100%; overflow:hidden; text-overflow:ellipsis;
    }
    .ac-quick:hover{
      background:var(--ac-light); border-color:var(--ac-teal); color:var(--ac-dark);
    }

    /* Barra de input */
    .ac-input-bar{
      padding:10px 12px; border-top:1px solid var(--ac-border);
      display:flex; gap:8px; align-items:flex-end; flex-shrink:0;
      background:#fff;
    }
    .ac-input{
      flex:1; border:1.5px solid var(--ac-border); border-radius:10px;
      padding:9px 13px; font-size:13.5px; color:var(--ac-txt);
      background:#fafdf9; resize:none; outline:none;
      max-height:100px; line-height:1.4; font-family:inherit;
      transition:border-color .2s;
    }
    .ac-input:focus{ border-color:var(--ac-teal); background:#fff; }
    .ac-input::placeholder{ color:var(--ac-sub); }
    .ac-send{
      background:linear-gradient(135deg,var(--ac-dark),var(--ac-teal));
      border:none; cursor:pointer; width:38px; height:38px; border-radius:10px;
      display:flex; align-items:center; justify-content:center;
      transition:opacity .2s, transform .15s; flex-shrink:0;
    }
    .ac-send:disabled{ opacity:.45; cursor:default; }
    .ac-send:not(:disabled):hover{ transform:scale(1.07); }
    .ac-send:not(:disabled):active{ transform:scale(.95); }
    .ac-send svg{ width:17px; height:17px; fill:none; stroke:#fff; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }

    /* Footer disclaimer */
    .ac-footer{
      padding:5px 12px 8px; text-align:center;
      font-size:10.5px; color:var(--ac-sub); background:#fff; flex-shrink:0;
    }
    .ac-footer a{ color:var(--ac-teal); text-decoration:none; }

    /* ── Utilidad: ocultar elementos ── */
    .ac-hidden{ display:none !important; }

    /* ── Animaciones ── */
    @keyframes ac-pop{
      from{ opacity:0; transform:scale(.92) translateY(6px); }
      to  { opacity:1; transform:scale(1)   translateY(0); }
    }
    @keyframes ac-bounce{
      0%,60%,100%{ transform:translateY(0); }
      30%          { transform:translateY(-5px); }
    }

    /* ── Mobile ── */
    @media(max-width:420px){
      #alba-panel{
        left:0; right:0; bottom:0; width:100%; max-width:100%;
        height:100dvh; max-height:100dvh;
        border-radius:0; bottom:0;
        transform:translateY(100%); opacity:1;
        transform-origin:bottom center;
      }
      #alba-panel.open{ transform:translateY(0); }
      #alba-fab{ bottom:20px; left:16px; }
      #alba-proactive{ left:16px; bottom:88px; }
    }
  `;
  document.head.appendChild(style);

  // ─── HTML del widget ─────────────────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = 'alba-chat-root';
  container.innerHTML = `
    <!-- Burbuja proactiva -->
    <div id="alba-proactive">
      <button class="ac-close-pro" id="ac-close-pro" title="Cerrar">×</button>
      👋 ¡Hola! Soy <strong>Alba</strong>. ¿Te ayudo a encontrar tu casa ideal?
    </div>

    <!-- Botón flotante -->
    <button id="alba-fab" title="Hablar con Alba IA" aria-label="Abrir chat IA">
      <span class="ac-notif" id="ac-notif">1</span>
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="9" y2="10" stroke-width="2.5"/><line x1="12" y1="10" x2="12" y2="10" stroke-width="2.5"/><line x1="15" y1="10" x2="15" y2="10" stroke-width="2.5"/></svg>
    </button>

    <!-- Panel -->
    <div id="alba-panel" role="dialog" aria-label="Chat con Alba">
      <!-- Header -->
      <div class="ac-header">
        <div class="ac-avatar">🏠</div>
        <div class="ac-header-info">
          <p class="ac-header-name">Alba · Asistente IA</p>
          <div class="ac-header-status">
            <div class="ac-online-dot"></div>
            <span>El Alba · Casas Prefabricadas</span>
          </div>
        </div>
        <div class="ac-header-btns">
          <button class="ac-hbtn" id="ac-wa-btn" title="Abrir WhatsApp">
            <svg viewBox="0 0 24 24" style="width:17px;height:17px;fill:#25D366;stroke:none;">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </button>
          <button class="ac-hbtn" id="ac-close-panel" title="Cerrar chat">
            <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Pantalla de registro (primer uso) -->
      <div id="ac-register" class="ac-hidden">
        <div class="ac-reg-icon">🏠</div>
        <h3 class="ac-reg-title">¡Hola! Soy Alba 👋</h3>
        <p class="ac-reg-subtitle">Antes de comenzar, ¿me dejas tu nombre y teléfono para poder ayudarte mejor?</p>
        <div class="ac-reg-fields">
          <div class="ac-reg-field">
            <span class="ac-reg-field-icon">👤</span>
            <input class="ac-reg-input" id="ac-reg-nombre" type="text" placeholder="Tu nombre *" autocomplete="given-name" maxlength="60">
          </div>
          <div class="ac-reg-field">
            <span class="ac-reg-field-icon">📱</span>
            <input class="ac-reg-input" id="ac-reg-telefono" type="tel" placeholder="+56 9 XXXX XXXX *" autocomplete="tel" maxlength="20">
          </div>
        </div>
        <button class="ac-reg-btn" id="ac-reg-btn" disabled>
          Iniciar conversación →
        </button>
        <div class="ac-reg-skip">
          <button id="ac-reg-skip">Continuar sin registrarme</button>
        </div>
        <p class="ac-reg-privacy">🔒 Tus datos solo se usan para contactarte.<br>No compartimos tu información con terceros.</p>
      </div>

      <!-- Mensajes (oculto hasta que se complete el registro) -->
      <div class="ac-messages ac-hidden" id="ac-messages"></div>

      <!-- Quick replies (visible solo al inicio) -->
      <div class="ac-quick-wrap ac-hidden" id="ac-quick-wrap"></div>

      <!-- Input (oculto hasta que se complete el registro) -->
      <div class="ac-input-bar ac-hidden" id="ac-input-bar">
        <textarea class="ac-input" id="ac-input" placeholder="Escribe tu consulta…" rows="1" autocomplete="off"></textarea>
        <button class="ac-send" id="ac-send" disabled aria-label="Enviar">
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>

      <!-- Footer -->
      <div class="ac-footer" id="ac-footer-bar">
        Potenciado por IA · <a href="https://wa.me/${CFG.waNumber}" target="_blank" rel="noopener">WhatsApp +56 9 3184 6889</a>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // ─── Referencias DOM ─────────────────────────────────────────────────────────
  const fab          = document.getElementById('alba-fab');
  const panel        = document.getElementById('alba-panel');
  const messagesEl   = document.getElementById('ac-messages');
  const inputEl      = document.getElementById('ac-input');
  const inputBar     = document.getElementById('ac-input-bar');
  const sendBtn      = document.getElementById('ac-send');
  const closePanel   = document.getElementById('ac-close-panel');
  const waBtn        = document.getElementById('ac-wa-btn');
  const notifDot     = document.getElementById('ac-notif');
  const proactiveEl  = document.getElementById('alba-proactive');
  const closeProBtn  = document.getElementById('ac-close-pro');
  const quickWrap    = document.getElementById('ac-quick-wrap');
  const registerEl   = document.getElementById('ac-register');
  const regNombre    = document.getElementById('ac-reg-nombre');
  const regTelefono  = document.getElementById('ac-reg-telefono');
  const regBtn       = document.getElementById('ac-reg-btn');
  const regSkip      = document.getElementById('ac-reg-skip');

  // ─── Persistencia ────────────────────────────────────────────────────────────
  function saveHistory() {
    try {
      const slice = messages.slice(-CFG.maxHistory);
      sessionStorage.setItem(CFG.storageKey, JSON.stringify(slice));
    } catch(e) {}
  }

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(CFG.storageKey);
      if (raw) messages = JSON.parse(raw);
    } catch(e) { messages = []; }
  }

  function saveUserData() {
    try {
      sessionStorage.setItem(CFG.storageUserKey, JSON.stringify(userData));
    } catch(e) {}
  }

  function loadUserData() {
    try {
      const raw = sessionStorage.getItem(CFG.storageUserKey);
      if (raw) userData = JSON.parse(raw);
    } catch(e) {}
  }

  // ─── Mostrar / ocultar secciones ─────────────────────────────────────────────
  function showChat() {
    registerEl.classList.add('ac-hidden');
    messagesEl.classList.remove('ac-hidden');
    quickWrap.classList.remove('ac-hidden');
    inputBar.classList.remove('ac-hidden');
    setTimeout(() => inputEl.focus(), 300);
  }

  function showRegisterForm() {
    registerEl.classList.remove('ac-hidden');
    messagesEl.classList.add('ac-hidden');
    quickWrap.classList.add('ac-hidden');
    inputBar.classList.add('ac-hidden');
    setTimeout(() => regNombre.focus(), 300);
  }

  // ─── Validar formulario de registro ──────────────────────────────────────────
  function validateRegForm() {
    const nombre    = regNombre.value.trim();
    const telefono  = regTelefono.value.trim();
    // Teléfono: al menos 8 dígitos
    const telOk     = /\d{8,}/.test(telefono.replace(/\D/g,''));
    regBtn.disabled = !(nombre.length >= 2 && telOk);
  }

  regNombre.addEventListener('input', validateRegForm);
  regTelefono.addEventListener('input', validateRegForm);

  // Permitir enviar con Enter en el campo teléfono
  regTelefono.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !regBtn.disabled) submitRegister();
  });
  regNombre.addEventListener('keydown', e => {
    if (e.key === 'Enter') regTelefono.focus();
  });

  // ─── Completar registro ───────────────────────────────────────────────────────
  function submitRegister() {
    const nombre   = regNombre.value.trim();
    const telefono = regTelefono.value.trim();
    userData = { nombre, telefono };
    saveUserData();
    leadCaptured = true; // ya tenemos los datos
    showChat();
    showWelcome();
  }

  function skipRegister() {
    userData = { nombre: '', telefono: '' };
    showChat();
    showWelcome();
  }

  regBtn.addEventListener('click', submitRegister);
  regSkip.addEventListener('click', skipRegister);

  // ─── Renderizado de mensajes ─────────────────────────────────────────────────
  function escapeHtml(str) {
    return str
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function markdownToHtml(text) {
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/\n/g, '<br>');
    return text;
  }

  function appendMessage(role, content, opts = {}) {
    const div = document.createElement('div');
    div.className = 'ac-msg ' + (role === 'user' ? 'user' : 'bot');

    const html = opts.raw
      ? markdownToHtml(content)
      : markdownToHtml(escapeHtml(content));

    div.innerHTML = `
      <div class="ac-msg-avatar">${role === 'user' ? '👤' : '🏠'}</div>
      <div class="ac-bubble">${html}</div>
    `;
    messagesEl.appendChild(div);
    scrollBottom();
    return div;
  }

  function showTyping() {
    if (isTyping) return;
    isTyping = true;
    const div = document.createElement('div');
    div.className = 'ac-msg bot ac-typing';
    div.id = 'ac-typing-indicator';
    div.innerHTML = `
      <div class="ac-msg-avatar">🏠</div>
      <div class="ac-bubble">
        <span class="ac-dot"></span>
        <span class="ac-dot"></span>
        <span class="ac-dot"></span>
      </div>`;
    messagesEl.appendChild(div);
    scrollBottom();
  }

  function hideTyping() {
    isTyping = false;
    const el = document.getElementById('ac-typing-indicator');
    if (el) el.remove();
  }

  function showLeadBanner(nombre) {
    const div = document.createElement('div');
    div.className = 'ac-lead-banner';
    div.innerHTML = `✅ ¡Gracias, <strong>${escapeHtml(nombre)}</strong>! El equipo de El Alba te contactará pronto.`;
    messagesEl.appendChild(div);
    scrollBottom();
  }

  function scrollBottom() {
    setTimeout(() => { messagesEl.scrollTop = messagesEl.scrollHeight; }, 60);
  }

  // ─── Quick replies ────────────────────────────────────────────────────────────
  function renderQuickReplies() {
    quickWrap.innerHTML = '';
    if (messages.length > 2) return;
    QUICK_REPLIES.forEach(qr => {
      const btn = document.createElement('button');
      btn.className = 'ac-quick';
      btn.textContent = qr.label;
      btn.addEventListener('click', () => sendMessage(qr.text));
      quickWrap.appendChild(btn);
    });
  }

  function hideQuickReplies() {
    quickWrap.innerHTML = '';
  }

  // ─── Mensaje de bienvenida ────────────────────────────────────────────────────
  function showWelcome() {
    if (messages.length === 0) {
      const nombre = userData && userData.nombre ? userData.nombre.split(' ')[0] : '';
      const saludo = nombre ? `¡Hola, **${nombre}**! 👋` : '¡Hola! 👋';
      const welcome = `${saludo} Soy **Alba**, la asistente virtual de **Casas Prefabricadas El Alba**.\n\nPuedo ayudarte con precios, modelos, qué incluye cada kit, plazos de entrega y mucho más. ¿Por dónde te gustaría empezar?`;
      appendMessage('assistant', welcome);
      renderQuickReplies();
    } else {
      messages.forEach(m => appendMessage(m.role, m.content));
      scrollBottom();
    }
  }

  // ─── Llamada directa a Groq desde el browser (fallback para dev local) ────────
  async function callGroqDirect(msgs) {
    if (!CFG.groqKey) throw new Error('No groqKey configurado');
    const resp = await fetch(CFG.groqUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + CFG.groqKey,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:       CFG.groqModel,
        messages:    [{ role: 'system', content: SYSTEM_PROMPT_JS }, ...msgs],
        max_tokens:  500,
        temperature: 0.6,
      }),
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.error?.message || 'Groq HTTP ' + resp.status);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // ─── Procesar respuesta (detectar lead) ──────────────────────────────────────
  function processReply(rawText) {
    const marker = 'LEAD_CAPTURADO';
    let cleanText = rawText;
    let isLead    = false;
    if (rawText.includes(marker)) {
      isLead    = true;
      cleanText = rawText.replace(/LEAD_CAPTURADO\s*\{[^}]+\}/s, '').trim();
    }
    return { cleanText, isLead };
  }

  // ─── Enviar mensaje ───────────────────────────────────────────────────────────
  async function sendMessage(text) {
    text = (text || inputEl.value).trim();
    if (!text || isTyping) return;

    inputEl.value = '';
    inputEl.style.height = '';
    sendBtn.disabled = true;
    hideQuickReplies();

    messages.push({ role: 'user', content: text });
    appendMessage('user', text);
    saveHistory();

    const delay = CFG.typingDuration.min + Math.random() * (CFG.typingDuration.max - CFG.typingDuration.min);
    showTyping();
    await new Promise(r => setTimeout(r, delay));

    let reply      = '';
    let isLeadResp = false;

    try {
      // ── Intento 1: servidor PHP ──────────────────────────────────────────────
      const payload = { messages };
      // Pasar datos del usuario para que el PHP los use como contexto
      if (userData && userData.nombre) payload.userName    = userData.nombre;
      if (userData && userData.telefono) payload.userPhone = userData.telefono;

      const resp = await fetch(CFG.apiUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Error en el servidor');

      reply      = data.reply  || '';
      isLeadResp = data.lead   || false;

    } catch (phpErr) {
      // ── Intento 2: fallback directo a Groq (dev local / file://) ────────────
      if (CFG.groqKey) {
        try {
          const rawReply     = await callGroqDirect(messages);
          const { cleanText, isLead } = processReply(rawReply);
          reply      = cleanText;
          isLeadResp = isLead;
          console.info('[Alba Chat] Usando fallback Groq directo (modo local)');
        } catch (groqErr) {
          hideTyping();
          appendMessage('assistant',
            '😔 Hubo un problema conectando con la IA. Escríbenos al **WhatsApp +56 9 3184 6889** y uno de nuestros ejecutivos te atiende de inmediato.'
          );
          console.error('[Alba Chat] Groq directo falló:', groqErr);
          return;
        }
      } else {
        hideTyping();
        appendMessage('assistant',
          '⚠️ El chat requiere un servidor PHP para funcionar correctamente.\n\nPor ahora puedes escribirnos al **WhatsApp +56 9 3184 6889** y te respondemos enseguida. 😊'
        );
        console.warn('[Alba Chat] Sin servidor PHP y sin groqKey. Error:', phpErr);
        return;
      }
    }

    hideTyping();
    messages.push({ role: 'assistant', content: reply });
    appendMessage('assistant', reply);
    saveHistory();

    if (isLeadResp && !leadCaptured) {
      leadCaptured = true;
      const nombreMatch = reply.match(/([A-ZÁÉÍÓÚÑa-záéíóúñ]{3,})/);
      showLeadBanner(nombreMatch ? nombreMatch[0] : 'cliente');
    }
  }

  // ─── Auto-resize textarea ─────────────────────────────────────────────────────
  inputEl.addEventListener('input', function() {
    sendBtn.disabled = !this.value.trim();
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
  });

  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendMessage();
    }
  });

  sendBtn.addEventListener('click', () => sendMessage());

  // ─── Abrir / Cerrar panel ─────────────────────────────────────────────────────
  function openChat() {
    isOpen = true;
    panel.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');
    hideProactive();
    notifDot.classList.remove('show');

    if (!messagesEl.children.length) {
      // Primera vez abriendo en esta sesión
      if (userData !== null) {
        // Usuario ya se registró (o saltó) en esta sesión
        showChat();
        showWelcome();
      } else {
        // Mostrar formulario de registro
        showRegisterForm();
      }
    }
    // Si ya hay mensajes, el chat ya está visible, no hacer nada
  }

  function closeChat() {
    isOpen = false;
    panel.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
  }

  fab.addEventListener('click', () => isOpen ? closeChat() : openChat());
  closePanel.addEventListener('click', closeChat);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) closeChat();
  });

  // ─── WhatsApp con contexto ────────────────────────────────────────────────────
  waBtn.addEventListener('click', () => {
    const lastUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0];
    let waText = 'Hola! Vengo del chat de la web y me gustaría más información sobre sus casas prefabricadas.';
    if (userData && userData.nombre) waText = `Hola! Soy ${userData.nombre}, vengo del chat de la web.`;
    if (lastUserMsg) waText += ` Mi consulta: ${lastUserMsg.content.substring(0, 150)}`;
    window.open(`https://wa.me/${CFG.waNumber}?text=${encodeURIComponent(waText)}`, '_blank');
  });

  // ─── Burbuja proactiva ────────────────────────────────────────────────────────
  function showProactive() {
    if (proactiveSent || isOpen) return;
    proactiveSent = true;
    proactiveEl.style.display = 'block';
    notifDot.classList.add('show');
    setTimeout(hideProactive, 10000);
  }

  function hideProactive() {
    proactiveEl.style.display = 'none';
  }

  closeProBtn.addEventListener('click', e => {
    e.stopPropagation();
    hideProactive();
    notifDot.classList.remove('show');
  });

  proactiveEl.addEventListener('click', () => {
    hideProactive();
    openChat();
  });

  // ─── Inicialización ───────────────────────────────────────────────────────────
  loadUserData();
  loadHistory();

  // Si ya hay historial de mensajes (sesión previa), marcar como ya en chat
  if (messages.length > 0 && userData === null) {
    // Había historial pero no datos de usuario → saltar registro
    userData = { nombre: '', telefono: '' };
  }

  if (messages.length === 0) {
    proactiveTimer = setTimeout(showProactive, CFG.proactiveDelay);
  }

  fab.addEventListener('click', () => {
    if (proactiveTimer) { clearTimeout(proactiveTimer); proactiveTimer = null; }
  }, { once: false });

  // ─── Exponer API pública (opcional) ──────────────────────────────────────────
  window.AlbaChat = { open: openChat, close: closeChat, send: sendMessage };

})();
