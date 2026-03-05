<?php
/**
 * chat.php — Casas Prefabricadas El Alba
 * Proxy hacia Groq API (llama-3.1-8b-instant) + caché de respuestas + captura de leads.
 *
 * ESTRATEGIA DE CACHÉ (0 tokens para respuestas frecuentes):
 *   1. FAQ shortcuts  → respuestas pre-escritas para preguntas comunes (sin llamar a Groq)
 *   2. File cache     → guarda respuesta de Groq en disco por 8 horas
 *      Clave de caché = md5(mensaje_normalizado)  solo en primera pregunta de la conversación
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input || empty($input['messages'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Payload inválido']);
    exit;
}

// ─── Configuración ──────────────────────────────────────────────────────────
require_once __DIR__ . '/config.php'; // API key y secretos (gitignoreado)
define('GROQ_MODEL',   'llama-3.1-8b-instant');
define('GROQ_URL',     'https://api.groq.com/openai/v1/chat/completions');
define('EMAIL_DEST',   'contacto@prefabricadaselalba.cl');
define('CACHE_DIR',    __DIR__ . '/cache');
define('CACHE_TTL',    28800); // 8 horas

// ─── Datos del usuario (enviados por el widget al registrarse) ─────────────
$userName  = trim($input['userName']  ?? '');
$userPhone = trim($input['userPhone'] ?? '');

// ─── Validar y limpiar mensajes ──────────────────────────────────────────────
$messages = array_filter($input['messages'], function($m) {
    return isset($m['role'], $m['content'])
        && in_array($m['role'], ['user', 'assistant'])
        && is_string($m['content'])
        && strlen(trim($m['content'])) > 0;
});
$messages = array_values($messages);

// Limitar historial a 6 mensajes (3 intercambios) para reducir tokens
if (count($messages) > 6) {
    $messages = array_slice($messages, -6);
}

// ─── Obtener último mensaje del usuario ─────────────────────────────────────
$lastUserMsg = '';
foreach (array_reverse($messages) as $m) {
    if ($m['role'] === 'user') { $lastUserMsg = $m['content']; break; }
}

// ══════════════════════════════════════════════════════════════════════════════
// CAPA 1 — FAQ SHORTCUTS (0 tokens, respuesta instantánea)
// Solo aplica si es la primera pregunta (sin historial de asistente)
// ══════════════════════════════════════════════════════════════════════════════
$hasAssistantHistory = false;
foreach ($messages as $m) {
    if ($m['role'] === 'assistant') { $hasAssistantHistory = true; break; }
}

if (!$hasAssistantHistory && $lastUserMsg) {
    $faqReply = getFaqReply($lastUserMsg, $userName);
    if ($faqReply !== null) {
        // Enviar email de lead si tenemos datos del usuario
        if ($userName && $userPhone) {
            sendLeadEmail($userName, $userPhone, 'FAQ: ' . substr($lastUserMsg, 0, 60), 'Primera consulta via FAQ shortcut');
        }
        echo json_encode([
            'success'  => true,
            'reply'    => $faqReply,
            'lead'     => false,
            'source'   => 'faq',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// CAPA 2 — FILE CACHE (0 tokens, para preguntas repetidas)
// Solo cachea la primera pregunta en una conversación nueva (sin contexto previo)
// No cachea si hay datos de usuario (la respuesta puede incluir nombre)
// ══════════════════════════════════════════════════════════════════════════════
$cacheKey  = null;
$useCache  = !$hasAssistantHistory && !$userName; // Sin historial y sin nombre personalizado
if ($useCache && $lastUserMsg) {
    $cacheKey    = getCacheKey($lastUserMsg);
    $cachedReply = getCache($cacheKey);
    if ($cachedReply !== null) {
        echo json_encode([
            'success' => true,
            'reply'   => $cachedReply,
            'lead'    => false,
            'source'  => 'cache',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// CAPA 3 — GROQ API (tokens reales, solo si caché y FAQ no resolvieron)
// ══════════════════════════════════════════════════════════════════════════════

// ─── System Prompt ───────────────────────────────────────────────────────────
$SYSTEM_PROMPT = <<<'PROMPT'
Eres "Alba", asistente virtual de Casas Prefabricadas El Alba. Amable, experta, respondes en español chileno cercano y conciso. Solo responde lo preguntado.

EMPRESA: Av. Calera de Tango P-8C, San Bernardo RM | WhatsApp: +56 9 3184 6889 (Lun-Vie 8-17h) | contacto@prefabricadaselalba.cl | prefabricadaselalba.cl | Entrega todo Chile

PRECIOS (CLP, sin IVA) — Modelo | Kit Autoconstrucción | Kit+Instalaciones | Llave en Mano
MODERNO: 36m² $7.740.000/$18.720.000/$21.960.000 · 42m² $9.030.000/$21.840.000/$25.620.000 · 45,6m² $9.804.000/$23.712.000/$27.816.000 · 47m² $10.105.000/$24.440.000/$28.670.000 · 54m² $11.610.000/$28.080.000/$32.940.000 · 57m² $12.255.000/$29.640.000/$34.770.000 · 72m² $15.480.000/$37.440.000/$43.920.000 · 74m² $15.910.000/$38.480.000/$45.140.000 · 76m² $16.340.000/$39.520.000/$46.360.000 · 80m² $17.200.000/$41.600.000/$48.800.000 · 83m² $17.845.000/$43.160.000/$50.630.000 · 94m² $20.210.000/$48.880.000/$57.340.000 · 100m² $21.500.000/$52.000.000/$61.000.000 · 107m² $23.005.000/$55.640.000/$65.270.000 · 118m² $25.370.000/$61.360.000/$71.980.000 · 136m² $29.240.000/$70.720.000/$82.960.000 · 138m² $29.670.000/$71.760.000/$84.180.000
MEDITERRÁNEA: 94m² $21.526.000/$50.760.000/$59.220.000 · 120m² $27.600.000/$43.200.000/$50.400.000 · 149m² $31.740.000/$80.460.000/$93.870.000 · 193m² $44.390.000/$104.220.000/$121.590.000 · 196m² $45.080.000/$101.920.000/$119.560.000
AMERICANA: 120m² $25.800.000/$62.400.000/$73.200.000 · 139m² $29.885.000/$72.280.000/$84.790.000 · 140m² $30.100.000/$72.800.000/$85.400.000 · 191m² $41.065.000/$99.320.000/$116.510.000
2 NIVELES: 117m² $30.303.000/$48.970.000/$59.760.000
TRADICIONAL: 130m² $27.950.000/$67.600.000/$79.300.000 · 134m² $28.810.000/$69.680.000/$81.740.000 · 141m² $30.315.000/$73.320.000/$86.010.000 · 149m² $28.810.000/$69.680.000/$81.740.000
COLONIAL: 255m² $58.650.000/$132.600.000/$155.550.000

LAS 3 MODALIDADES:
KIT AUTOCONSTRUCCIÓN — Materiales para armar: estructura Metalcon acero galv. · exterior Vinyl Siding PVC Beige · interior Yeso Cartón · techumbre Teja Asfáltica · puertas + ventanas aluminio · aislante Fisiterm 100mm · quincallería · NO incluye: armado, fundación, flete, instalaciones eléctricas/agua/alcant., pinturas, cerámicos, artefactos. Pago 50%+50%. Entrega 7-10 días hábiles.
KIT+INSTALACIONES — Todo lo anterior MÁS: fundación radier hormigón · exterior Fibrocemento · electricidad (tablero+circuitos, sin empalme) · agua PPR (sin empalme) · alcantarillado PVC (sin empalme). NO incluye: pinturas, cerámicos, artefactos, empalmes. Inicio: 10-15 días post firma notarial.
LLAVE EN MANO — Todo lo anterior MÁS: pinturas · cerámicos tope $9.000/m² · artefactos (WC+lavamanos+tina, mueble+lavaplatos+2 calefones) · terraza pino Oregón · traslado hasta 150km. Pago 30+30+30+10%. ~1 día hábil por m².

RESPUESTAS CLAVE: Precios sin IVA · Solo transferencia o efectivo · Permiso de construcción: responsabilidad del propietario · Visita fábrica: coordinar por WhatsApp

INSTRUCCIONES:
- Sugiere modelos según presupuesto o m² mencionados, mostrando los 3 precios
- Ofrece WhatsApp para cotizaciones personalizadas o visita a fábrica
- No inventes datos fuera de este prompt; si no sabes, deriva al equipo comercial
- El cliente ya proporcionó sus datos de contacto al registrarse, NO los pidas de nuevo

CAPTURA DE LEADS: Si el cliente muestra intención clara de compra o pide cotización personalizada, incluye AL FINAL (línea separada, sin texto adicional):
LEAD_CAPTURADO{"nombre":"[nombre]","contacto":"[teléfono]","interes":"[modelo/presupuesto]","resumen":"[1 frase]"}
PROMPT;

// ─── Agregar contexto del usuario al system prompt si está disponible ────────
$userContext = '';
if ($userName || $userPhone) {
    $userContext .= "\n\nCONTEXTO DEL CLIENTE (ya registrado, NO pedir estos datos de nuevo):";
    if ($userName)  $userContext .= "\n- Nombre: {$userName}";
    if ($userPhone) $userContext .= "\n- Teléfono: {$userPhone}";
    $userContext .= "\nPuedes dirigirte al cliente por su nombre para hacer la conversación más cercana.";

    // Si tenemos datos, marcar lead como pre-capturado
    if ($userName && $userPhone) {
        $userContext .= "\n- Lead ya capturado: SÍ (datos disponibles). No incluir LEAD_CAPTURADO en esta respuesta.";
    }
}

$fullSystemPrompt = $SYSTEM_PROMPT . $userContext;

// ─── Llamar a Groq ───────────────────────────────────────────────────────────
$payload = json_encode([
    'model'       => GROQ_MODEL,
    'messages'    => array_merge(
        [['role' => 'system', 'content' => $fullSystemPrompt]],
        $messages
    ),
    'max_tokens'  => 500,
    'temperature' => 0.6,
    'stream'      => false,
]);

$ch = curl_init(GROQ_URL);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Bearer ' . GROQ_API_KEY,
        'Content-Type: application/json',
    ],
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$raw      = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($curlErr) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => 'Error de conexión con Groq: ' . $curlErr]);
    exit;
}

$groqResp = json_decode($raw, true);

if ($httpCode !== 200 || empty($groqResp['choices'][0]['message']['content'])) {
    $errMsg = $groqResp['error']['message'] ?? 'Respuesta inesperada de Groq';
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => $errMsg, 'http' => $httpCode]);
    exit;
}

$fullText = $groqResp['choices'][0]['message']['content'];

// ─── Detectar lead capturado ─────────────────────────────────────────────────
$leadData   = null;
$cleanText  = $fullText;
$leadMarker = 'LEAD_CAPTURADO';

if (strpos($fullText, $leadMarker) !== false) {
    preg_match('/' . preg_quote($leadMarker, '/') . '\s*(\{[^}]+\})/s', $fullText, $matches);
    if (!empty($matches[1])) {
        $leadData = json_decode($matches[1], true);
    }
    $cleanText = trim(preg_replace('/' . preg_quote($leadMarker, '/') . '\s*\{[^}]+\}/s', '', $fullText));
}

// ─── Guardar en caché si aplica ─────────────────────────────────────────────
// Solo cachea respuestas sin datos personales (sin nombre de usuario)
if ($useCache && $cacheKey && $cleanText && !$leadData) {
    setCache($cacheKey, $cleanText);
}

// ─── Enviar email de lead si se capturó ──────────────────────────────────────
$emailSent = false;
if ($leadData) {
    // Preferir datos del registro sobre lo que detectó la IA
    $leadNombre   = $userName  ?: ($leadData['nombre']   ?? 'Sin nombre');
    $leadContacto = $userPhone ?: ($leadData['contacto'] ?? 'No indicado');
    $leadInteres  = $leadData['interes']  ?? 'No indicado';
    $leadResumen  = $leadData['resumen']  ?? '';
    $emailSent    = sendLeadEmail($leadNombre, $leadContacto, $leadInteres, $leadResumen, $messages);
} elseif ($userName && $userPhone && count($messages) <= 2) {
    // Primera interacción con datos de registro → notificar nuevo lead
    $emailSent = sendLeadEmail($userName, $userPhone, 'Nuevo registro en chat', 'Usuario se registró en el chat IA', $messages);
}

// ─── Respuesta al frontend ────────────────────────────────────────────────────
echo json_encode([
    'success'    => true,
    'reply'      => $cleanText,
    'lead'       => $leadData ? true : false,
    'email_sent' => $emailSent,
    'source'     => 'groq',
], JSON_UNESCAPED_UNICODE);


// ══════════════════════════════════════════════════════════════════════════════
// FUNCIONES DE CACHÉ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Normaliza un mensaje para usarlo como clave de caché.
 * Lowercase + sin tildes + sin espacios extra + sin signos de pregunta/exclamación
 */
function normalizeMsg(string $msg): string {
    $msg = mb_strtolower(trim($msg), 'UTF-8');
    // Quitar tildes
    $msg = str_replace(
        ['á','é','í','ó','ú','ü','ñ','à','è','ì','ò','ù'],
        ['a','e','i','o','u','u','n','a','e','i','o','u'],
        $msg
    );
    // Quitar signos de puntuación al inicio/fin
    $msg = trim($msg, '¿?¡!.,;:');
    // Colapsar espacios
    $msg = preg_replace('/\s+/', ' ', $msg);
    return $msg;
}

function getCacheKey(string $lastMessage): string {
    return md5(normalizeMsg($lastMessage));
}

function getCache(string $key): ?string {
    $file = CACHE_DIR . '/' . $key . '.json';
    if (!file_exists($file)) return null;
    if (time() - filemtime($file) > CACHE_TTL) {
        @unlink($file);
        return null;
    }
    $data = json_decode(file_get_contents($file), true);
    return ($data && isset($data['reply'])) ? $data['reply'] : null;
}

function setCache(string $key, string $reply): void {
    if (!is_dir(CACHE_DIR)) {
        @mkdir(CACHE_DIR, 0755, true);
        // Bloquear acceso web al directorio de caché
        @file_put_contents(CACHE_DIR . '/.htaccess', "Deny from all\n");
    }
    @file_put_contents(
        CACHE_DIR . '/' . $key . '.json',
        json_encode(['reply' => $reply, 'ts' => time()], JSON_UNESCAPED_UNICODE)
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// FUNCIONES DE FAQ SHORTCUTS
// Respuestas pre-escritas para las preguntas más frecuentes.
// Retorna string si hay match, null si no aplica.
// ══════════════════════════════════════════════════════════════════════════════
function getFaqReply(string $msg, string $userName = ''): ?string {
    $norm = normalizeMsg($msg);

    $saludo = $userName ? ", {$userName}" : '';

    // ── Saludo / inicio ──────────────────────────────────────────────────────
    if (preg_match('/^(hola|buenas|buen(o|a)s (dias?|tardes?|noches?)|hi|hey|saludos|hello)[\s!.]*$/', $norm)) {
        return "¡Hola{$saludo}! 👋 Bienvenido/a a **Casas Prefabricadas El Alba**.\n\nEstoy aquí para ayudarte con precios, modelos, modalidades de entrega y más. ¿Con qué te puedo ayudar hoy?";
    }

    // ── Preguntas sobre contacto / WhatsApp ──────────────────────────────────
    if (preg_match('/whatsapp|telefono|como (los|te|me|les) (contacto|llamo|escribo|comunico)|numero|llamar|hablar con (alguien|un ejecutivo|persona)/', $norm)) {
        return "Puedes contactarnos por:\n\n📱 **WhatsApp:** +56 9 3184 6889 (Lunes a Viernes hasta las 17:00 hrs)\n✉️ **Email:** contacto@prefabricadaselalba.cl\n🌐 **Web:** prefabricadaselalba.cl\n📍 **Dirección:** Av. Calera de Tango P-8C, San Bernardo, RM\n\nO si prefieres, escríbenos ahora mismo por WhatsApp y te respondemos de inmediato. 😊";
    }

    // ── Horario de atención ──────────────────────────────────────────────────
    if (preg_match('/horario|atienden|dias (de atencion|que trabajan)|cuando (atienden|abren|trabajan)/', $norm)) {
        return "Nuestro horario de atención es:\n\n📅 **Lunes a Viernes** hasta las **17:00 hrs**\n\nFuera de ese horario puedes dejarnos un mensaje por WhatsApp (+56 9 3184 6889) y te respondemos apenas estemos disponibles. 😊";
    }

    // ── Preguntas sobre modalidades / diferencia entre kits ─────────────────
    if (preg_match('/diferencia|modalidad|kit autoconstruccion|kit con instalacion|llave en mano|que incluye (cada|el|los) kit|opciones de compra|formas de comprar/', $norm)) {
        return "Ofrecemos **3 modalidades de entrega**:\n\n🔧 **Kit Autoconstrucción** — Materiales numerados para que tú armes la casa. Sin fundación, sin instalaciones. Precio más económico. Entrega 7-10 días.\n\n⚡ **Kit + Instalaciones** — El Kit anterior **más** fundación radier, electricidad, agua y alcantarillado. El Alba hace toda la obra. Sin pinturas ni artefactos.\n\n🏠 **Llave en Mano** — Todo listo para vivir: pinturas, cerámicos, artefactos de baño/cocina y terraza. Traslado incluido hasta 150 km de Santiago.\n\n¿Te cuento los precios de algún modelo en específico?";
    }

    // ── Preguntas sobre precios en general ───────────────────────────────────
    if (preg_match('/^(cuanto cuesta|precio(s)?|valor(es)?|cuanto vale|cuanto esta|cuanto son|tarifas?|lista de precio)/', $norm)) {
        return "Nuestros precios parten desde:\n\n🏗️ **Moderno 36 m²** — Desde $7.740.000 (Kit Autoconstrucción)\n🌊 **Mediterránea 94 m²** — Desde $21.526.000\n🏡 **Americana 120 m²** — Desde $25.800.000\n🏛️ **Tradicional 130 m²** — Desde $27.950.000\n🏢 **2 Niveles 117 m²** — Desde $30.303.000\n👑 **Colonial 255 m²** — Desde $58.650.000\n\n*Precios en CLP, sin IVA. Cada modelo tiene 3 opciones de precio según modalidad (Kit, Kit+Instalaciones, Llave en Mano).*\n\n¿Cuántos metros cuadrados necesitas o qué presupuesto tienes en mente?";
    }

    // ── Cuánto demora / plazo de entrega ────────────────────────────────────
    if (preg_match('/cuanto (tarda|demora|tiempo)|plazo(s)?|dias (de entrega|habiles)|cuando (entregan|llega|esta lista)/', $norm)) {
        return "Los plazos dependen de la modalidad:\n\n🔧 **Kit Autoconstrucción:** 7-10 días hábiles desde el pago.\n\n⚡ **Kit + Instalaciones:** Inicio de obras 10-15 días hábiles después de firmar el contrato notarial.\n\n🏠 **Llave en Mano:** Aproximadamente **1 día hábil por m²** de la casa (ej: una de 80 m² tarda ~80 días hábiles). Inicio 7 días post firma.\n\n¿Tienes algún plazo en mente para tu proyecto?";
    }

    // ── Despacho / flete / envío ─────────────────────────────────────────────
    if (preg_match('/flete|despacho|envio|envian a|llegara? a|regione?s?|todo chile|norte|sur|valparaiso|concepcion|antofagasta|la serena|rancagua|temuco|chillan/', $norm)) {
        return "¡Sí, hacemos entregas a **todo Chile**! 🇨🇱\n\n📦 **Kit Autoconstrucción:** Flete **no incluido**. Puedes retirar en nuestra fábrica (San Bernardo) o cotizamos el envío a tu región.\n\n🏠 **Llave en Mano:** Traslado **incluido** hasta 150 km de Santiago. Para distancias mayores, el ejecutivo informa el costo adicional.\n\n¿En qué región o ciudad estás ubicado/a?";
    }

    // ── Financiamiento / crédito hipotecario ────────────────────────────────
    if (preg_match('/financiamiento|credito|hipotecario|banco|cuotas|plazo(s)? de pago|dividendo|prestamo|credito bancario/', $norm)) {
        return "Actualmente **no ofrecemos financiamiento propio**, pero muchos clientes acceden a crédito hipotecario a través de su banco o institución financiera para comprar con nosotros. 🏦\n\nNuestras formas de pago son:\n💳 **Transferencia bancaria** o **efectivo**.\n\nSi necesitas ayuda para gestionar el crédito, puedes consultarle a tu banco directamente con nuestra cotización formal. ¿Te genero una cotización para que la presentes?";
    }

    // ── Permiso de edificación / municipalidad ───────────────────────────────
    if (preg_match('/permiso (de edificacion|de construccion|municipal|de obra)|municipalidad|dga|subdere|regularizacion|recepcion final/', $norm)) {
        return "Los **permisos de edificación y construcción** son responsabilidad del propietario. Nosotros no los tramitamos directamente.\n\nSin embargo, nuestras casas cumplen con las normativas técnicas chilenas, y podemos entregarte la documentación técnica necesaria (planos, especificaciones) para que la presentes en tu municipio.\n\n¿Tienes alguna consulta adicional sobre el proceso?";
    }

    // ── Visita a la fábrica / showroom ───────────────────────────────────────
    if (preg_match('/visita(r)?|showroom|fabrica|ver (la casa|modelos|en persona|fisicamente)|ir a ver|conocer (el lugar|las instalaciones)/', $norm)) {
        return "¡Por supuesto! Puedes **visitar nuestra fábrica** en San Bernardo para ver los modelos en persona. 🏭\n\n📍 **Dirección:** Av. Calera de Tango, Parcela 8-C, San Bernardo, RM\n📅 **Horario:** Lunes a Viernes hasta las 17:00 hrs\n\nCoordina tu visita escribiéndonos por **WhatsApp: +56 9 3184 6889** para asegurarte de que haya alguien disponible para atenderte. 😊";
    }

    // ── Garantía / post-venta ────────────────────────────────────────────────
    if (preg_match('/garantia|post.?venta|servicio (tecnico|post)|reclamo|problema despues|falla/', $norm)) {
        return "¡Claro! Ofrecemos **garantía y servicio post-venta** en nuestros proyectos. 🛡️\n\nAnte cualquier problema después de la entrega, puedes contactarnos por WhatsApp (+56 9 3184 6889) o email (contacto@prefabricadaselalba.cl) y nuestro equipo técnico te atenderá.\n\n¿Tienes alguna consulta específica sobre garantías?";
    }

    // ── No hay match de FAQ ──────────────────────────────────────────────────
    return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN DE EMAIL PARA LEADS
// ══════════════════════════════════════════════════════════════════════════════
function sendLeadEmail(string $nombre, string $contacto, string $interes, string $resumen, array $msgHistory = []): bool {
    $nombre   = htmlspecialchars($nombre,   ENT_QUOTES, 'UTF-8');
    $contacto = htmlspecialchars($contacto, ENT_QUOTES, 'UTF-8');
    $interes  = htmlspecialchars($interes,  ENT_QUOTES, 'UTF-8');
    $resumen  = htmlspecialchars($resumen,  ENT_QUOTES, 'UTF-8');
    $fecha    = date('d/m/Y H:i');

    // Número limpio para el link de WhatsApp
    $contacto_raw = preg_replace('/\D/', '', strip_tags($contacto));

    $subject = '=?UTF-8?B?' . base64_encode('🤖 Lead del Chat IA: ' . strip_tags($nombre) . ' — El Alba') . '?=';

    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: Chat IA El Alba <contacto@prefabricadaselalba.cl>\r\n";
    $headers .= "X-Mailer: PHP/" . phpversion() . "\r\n";

    // Construir historial de conversación
    $historial_rows = '';
    foreach ($msgHistory as $msg) {
        $rol   = $msg['role'] === 'user' ? '👤 Cliente' : '🤖 Alba';
        $texto = nl2br(htmlspecialchars($msg['content'], ENT_QUOTES, 'UTF-8'));
        $historial_rows .= "<tr><td style='padding:8px 0;border-bottom:1px solid #EBF7F1;'>
            <span style='font-size:10px;color:#6E8C80;font-weight:700;text-transform:uppercase;letter-spacing:1px;'>{$rol}</span>
            <p style='margin:4px 0 0;font-size:13px;color:#0C2018;line-height:1.6;'>{$texto}</p>
        </td></tr>";
    }

    // Sección de conversación (solo si hay historial)
    $historial_section = $historial_rows
        ? "<p style='margin:0 0 16px;font-size:12px;color:#6E8C80;text-transform:uppercase;letter-spacing:1px;font-weight:700;'>💬 Conversación</p><table width='100%' cellpadding='0' cellspacing='0'>{$historial_rows}</table>"
        : '';

    $body = <<<HTML
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F4FAF7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF7;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:linear-gradient(135deg,#1B3028 0%,#3D6CB8 60%,#00C4A7 100%);padding:28px 32px;">
          <p style="margin:0 0 4px;color:rgba(255,255,255,.65);font-size:11px;text-transform:uppercase;letter-spacing:2px;">Chat IA · $fecha</p>
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">🤖 Nuevo lead desde el chat</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px;">
          <div style="background:#EEF8F4;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #D4EDDF;">
            <p style="margin:0 0 12px;font-size:11px;color:#6E8C80;text-transform:uppercase;letter-spacing:1px;font-weight:700;">📋 Datos del lead</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:6px 0;border-bottom:1px solid #D4EDDF;"><span style="font-size:10px;color:#6E8C80;text-transform:uppercase;font-weight:700;display:block;margin-bottom:2px;">Nombre</span><span style="font-size:15px;color:#0C2018;font-weight:600;">$nombre</span></td></tr>
              <tr><td style="padding:6px 0;border-bottom:1px solid #D4EDDF;"><span style="font-size:10px;color:#6E8C80;text-transform:uppercase;font-weight:700;display:block;margin-bottom:2px;">Contacto</span><span style="font-size:15px;color:#0C2018;">$contacto</span></td></tr>
              <tr><td style="padding:6px 0;border-bottom:1px solid #D4EDDF;"><span style="font-size:10px;color:#6E8C80;text-transform:uppercase;font-weight:700;display:block;margin-bottom:2px;">Interés</span><span style="font-size:15px;color:#0C2018;">$interes</span></td></tr>
              <tr><td style="padding:6px 0;"><span style="font-size:10px;color:#6E8C80;text-transform:uppercase;font-weight:700;display:block;margin-bottom:2px;">Resumen</span><span style="font-size:14px;color:#3A5848;font-style:italic;">$resumen</span></td></tr>
            </table>
          </div>
          $historial_section
          <div style="margin-top:24px;text-align:center;">
            <a href="https://wa.me/56$contacto_raw?text=Hola+$nombre%2C+soy+de+El+Alba.+Vi+tu+consulta+sobre+$interes.+%C2%BFCu%C3%A9ntame+m%C3%A1s%3F" style="display:inline-block;background:#25D366;color:#fff;padding:13px 28px;border-radius:50px;text-decoration:none;font-weight:700;font-size:14px;">💬 Escribir por WhatsApp</a>
          </div>
        </td>
      </tr>
      <tr><td style="padding:16px 32px;background:#EBF7F1;border-top:1px solid #D4EDDF;"><p style="margin:0;font-size:12px;color:#6E8C80;text-align:center;">Casas Prefabricadas El Alba · <a href="https://prefabricadaselalba.cl" style="color:#00A58C;">prefabricadaselalba.cl</a></p></td></tr>
    </table>
  </td></tr>
</table>
</body></html>
HTML;

    return mail(EMAIL_DEST, $subject, $body, $headers);
}
