/**
 * alba-chat-config.js — Configuración del widget de chat IA para Casas Prefabricadas El Alba
 * 
 * Este archivo permite personalizar el chat sin editar el código fuente principal.
 * Simplemente modifica los valores según tus necesidades.
 */

window.AlbaChatConfig = {
  // ─── Configuración básica ──────────────────────────────────────────────────
  
  // URL del endpoint PHP que maneja las llamadas a Groq
  // Cambia esto si tu archivo chat.php está en una ruta diferente
  apiUrl: 'api/chat.php',
  
  // Clave API de Groq (solo para desarrollo local o entornos sin PHP)
  // ADVERTENCIA: No uses esto en producción, ya que expone tu clave API
  groqKey: '', // Ejemplo: 'gsk_xxxxxxxxxxxxxxxxxxxxx'
  
  // Modelo de Groq a utilizar
  groqModel: 'llama-3.1-8b-instant',
  
  // ─── Comportamiento del chat ───────────────────────────────────────────────
  
  // Tiempo en milisegundos antes de mostrar el mensaje proactivo
  proactiveDelay: 30000, // 30 segundos
  
  // Número de WhatsApp para el botón de contacto
  waNumber: '56931846889',
  
  // Máximo de mensajes a guardar en el historial (localStorage)
  maxHistory: 6,
  
  // Duración de la animación de escritura (en milisegundos)
  typingDuration: {
    min: 600,  // Mínimo tiempo de escritura
    max: 1400  // Máximo tiempo de escritura
  },
  
  // ─── Texto y mensajes ──────────────────────────────────────────────────────
  
  // Mensaje de bienvenida (puedes usar Markdown básico: **negrita**, *cursiva*)
  welcomeMessage: `¡Hola! 👋 Soy **Alba**, la asistente virtual de **Casas Prefabricadas El Alba**.\n\nPuedo ayudarte con precios, modelos, qué incluye cada kit, plazos de entrega y mucho más. ¿Por dónde te gustaría empezar?`,
  
  // Mensaje proactivo (el que aparece automáticamente)
  proactiveMessage: `👋 ¡Hola! Soy <strong>Alba</strong>. ¿Te ayudo a encontrar tu casa ideal?`,
  
  // Mensaje de error cuando no hay conexión
  errorMessage: `😔 Hubo un problema conectando con la IA. Escríbenos al **WhatsApp +56 9 3184 6889** y uno de nuestros ejecutivos te atiende de inmediato.`,
  
  // Mensaje de error para entornos sin PHP
  noServerMessage: `⚠️ El chat requiere un servidor PHP para funcionar correctamente.\n\nPor ahora puedes escribirnos al **WhatsApp +56 9 3184 6889** y te respondemos enseguida. 😊`,
  
  // ─── Respuestas rápidas (Quick Replies) ─────────────────────────────────────
  // Estas aparecen al inicio del chat para guiar al usuario
  quickReplies: [
    { label: '📐 Ver precios por m²',          text: '¿Cuáles son los precios según los m² de la casa?' },
    { label: '🔧 ¿Qué incluye cada kit?',      text: '¿Qué diferencia hay entre Kit Autoconstrucción, Kit con Instalaciones y Llave en Mano?' },
    { label: '🚚 Entrega a todo Chile',         text: '¿Hacen envío a todo Chile? ¿Cómo funciona el despacho?' },
    { label: '🏠 Casa desde $10 millones',     text: 'Tengo un presupuesto de unos 10 millones, ¿qué modelo me recomiendan?' },
    { label: '📅 ¿Cuánto tarda la entrega?',   text: '¿Cuánto tiempo demora la producción y entrega de la casa?' },
    { label: '📋 Agendar visita',              text: 'Me gustaría agendar una visita o hablar con alguien del equipo.' }
  ],
  
  // ─── Estilos personalizados (opcional) ──────────────────────────────────────
  // Puedes sobrescribir los colores del chat aquí
  // Deja en null para usar los colores por defecto
  customStyles: {
    // Colores principales
    primaryColor: null,    // Color principal (verde teal por defecto)
    secondaryColor: null,  // Color secundario (azul por defecto)
    backgroundColor: null, // Fondo del chat
    textColor: null,       // Color del texto
    
    // Estilos del botón flotante
    fabSize: null,         // Tamaño del botón (en px)
    fabPosition: null,     // Posición: 'bottom-left', 'bottom-right', 'top-left', 'top-right'
    
    // Estilos del panel
    panelWidth: null,      // Ancho del panel (en px o %)
    panelHeight: null,     // Alto del panel (en px o %)
  }
};

// ─── Validación de configuración ───────────────────────────────────────────────
(function() {
  const config = window.AlbaChatConfig;
  
  // Validar número de WhatsApp
  if (!config.waNumber || !/^\d{8,15}$/.test(config.waNumber)) {
    console.warn('[Alba Chat] Número de WhatsApp inválido. Asegúrate de usar solo dígitos.');
  }
  
  // Validar URL del API
  if (!config.apiUrl) {
    console.warn('[Alba Chat] URL del API no configurada. El chat no funcionará sin un endpoint PHP.');
  }
  
  // Validar modelo de Groq
  const validModels = ['llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768'];
  if (!validModels.includes(config.groqModel)) {
    console.warn(`[Alba Chat] Modelo Groq no válido: ${config.groqModel}. Usa uno de: ${validModels.join(', ')}`);
  }
  
  // Validar tiempos de escritura
  if (config.typingDuration.min < 100 || config.typingDuration.max > 5000) {
    console.warn('[Alba Chat] Tiempos de escritura fuera de rango recomendado (100ms - 5000ms)');
  }
  
  // Validar número máximo de historial
  if (config.maxHistory < 1 || config.maxHistory > 20) {
    console.warn('[Alba Chat] Máximo de historial fuera de rango recomendado (1-20)');
  }
  
  console.log('[Alba Chat] Configuración cargada:', config);
})();