<?php
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
if (!$input) {
    echo json_encode(['success' => false, 'error' => 'Datos inválidos']);
    exit;
}

// Sanitizar entradas
$nombre   = htmlspecialchars(strip_tags($input['nombre']   ?? 'No indicado'), ENT_QUOTES, 'UTF-8');
$telefono = htmlspecialchars(strip_tags($input['telefono'] ?? 'No indicado'), ENT_QUOTES, 'UTF-8');
$email    = filter_var($input['email'] ?? '', FILTER_SANITIZE_EMAIL);
$modelo   = htmlspecialchars(strip_tags($input['modelo']   ?? 'No indicado'), ENT_QUOTES, 'UTF-8');
$mensaje  = nl2br(htmlspecialchars(strip_tags($input['mensaje'] ?? 'Sin mensaje'), ENT_QUOTES, 'UTF-8'));
$fecha    = date('d/m/Y H:i');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'error' => 'Email inválido']);
    exit;
}

$headers_base  = "MIME-Version: 1.0\r\n";
$headers_base .= "Content-Type: text/html; charset=UTF-8\r\n";
$headers_base .= "From: Casas Prefabricadas El Alba <contacto@prefabricadaselalba.cl>\r\n";
$headers_base .= "X-Mailer: PHP/" . phpversion() . "\r\n";


// ══════════════════════════════════════════════════
// EMAIL 1 — Notificación interna para El Alba
// ══════════════════════════════════════════════════
$subject_interno = '=?UTF-8?B?' . base64_encode('💬 Nueva consulta de ' . $nombre . ' — El Alba') . '?=';
$headers_interno  = $headers_base;
$headers_interno .= "Reply-To: {$nombre} <{$email}>\r\n";

$body_interno = <<<HTML
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F4FAF7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF7;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:linear-gradient(135deg,#3D6CB8 0%,#00C4A7 100%);padding:28px 32px;">
          <p style="margin:0 0 4px;color:rgba(255,255,255,.7);font-size:11px;text-transform:uppercase;letter-spacing:2px;">Nueva consulta · $fecha</p>
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">💬 Solicitud desde el sitio web</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:10px 0;border-bottom:1px solid #EBF7F1;"><span style="display:block;font-size:10px;color:#6E8C80;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:3px;">Nombre</span><span style="font-size:15px;color:#0C2018;font-weight:600;">$nombre</span></td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #EBF7F1;"><span style="display:block;font-size:10px;color:#6E8C80;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:3px;">Teléfono</span><span style="font-size:15px;color:#0C2018;">$telefono</span></td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #EBF7F1;"><span style="display:block;font-size:10px;color:#6E8C80;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:3px;">Email</span><a href="mailto:$email" style="font-size:15px;color:#00A58C;text-decoration:none;">$email</a></td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #EBF7F1;"><span style="display:block;font-size:10px;color:#6E8C80;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:3px;">Modelo de interés</span><span style="font-size:15px;color:#0C2018;">$modelo</span></td></tr>
            <tr><td style="padding:10px 0;"><span style="display:block;font-size:10px;color:#6E8C80;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:8px;">Mensaje</span><div style="font-size:14px;color:#3A5848;line-height:1.7;background:#EEF8F4;padding:14px;border-radius:10px;border-left:3px solid #00C4A7;">$mensaje</div></td></tr>
          </table>
          <div style="margin-top:24px;text-align:center;">
            <a href="mailto:$email?subject=Re: Tu consulta sobre $modelo" style="display:inline-block;background:linear-gradient(135deg,#3D6CB8,#00C4A7);color:#fff;padding:13px 30px;border-radius:50px;text-decoration:none;font-weight:700;font-size:14px;margin-right:10px;">✉️ Responder</a>
            <a href="https://wa.me/56$telefono" style="display:inline-block;background:#25D366;color:#fff;padding:13px 30px;border-radius:50px;text-decoration:none;font-weight:700;font-size:14px;">💬 WhatsApp</a>
          </div>
        </td>
      </tr>
      <tr><td style="padding:16px 32px;background:#EBF7F1;border-top:1px solid #D4EDDF;"><p style="margin:0;font-size:12px;color:#6E8C80;text-align:center;">Casas Prefabricadas El Alba · <a href="https://prefabricadaselalba.cl" style="color:#00A58C;">prefabricadaselalba.cl</a></p></td></tr>
    </table>
  </td></tr>
</table>
</body></html>
HTML;

$ok = mail('contacto@prefabricadaselalba.cl', $subject_interno, $body_interno, $headers_interno);


// ══════════════════════════════════════════════════
// EMAIL 2 — Confirmación de recepción para el cliente
// ══════════════════════════════════════════════════
$nombre_corto  = explode(' ', $nombre)[0]; // Solo el primer nombre
$subject_cliente = '=?UTF-8?B?' . base64_encode('¡Recibimos tu consulta, ' . $nombre_corto . '! 🏠 — El Alba') . '?=';
$headers_cliente  = $headers_base;
$headers_cliente .= "Reply-To: Casas Prefabricadas El Alba <contacto@prefabricadaselalba.cl>\r\n";

$body_cliente = <<<HTML
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4FAF7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAF7;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;max-width:600px;width:100%;">

      <!-- HEADER con gradiente -->
      <tr>
        <td style="background:linear-gradient(135deg,#1B3028 0%,#3D6CB8 50%,#00C4A7 100%);padding:40px 32px;text-align:center;">
          <img src="https://prefabricadaselalba.cl/assets/images/logo.webp" alt="El Alba" width="120" style="border-radius:12px;margin-bottom:20px;display:block;margin-left:auto;margin-right:auto;">
          <h1 style="margin:0 0 8px;color:#fff;font-size:26px;font-weight:700;line-height:1.2;">¡Hola, $nombre_corto! 👋</h1>
          <p style="margin:0;color:rgba(255,255,255,.85);font-size:15px;line-height:1.5;">Recibimos tu consulta y ya estamos trabajando<br>para darte la mejor respuesta.</p>
        </td>
      </tr>

      <!-- MENSAJE PRINCIPAL -->
      <tr>
        <td style="padding:36px 32px 0;">
          <p style="margin:0 0 16px;color:#0C2018;font-size:15px;line-height:1.7;">
            Gracias por confiar en <strong>Casas Prefabricadas El Alba</strong>. Tu consulta es importante para nosotros y te responderemos a la brevedad — generalmente en menos de 24 horas hábiles.
          </p>
          <p style="margin:0;color:#3A5848;font-size:14px;line-height:1.7;">
            Mientras tanto, si necesitas una respuesta inmediata no dudes en escribirnos por WhatsApp. <strong>Uno de nuestros ejecutivos</strong> estará disponible para ayudarte.
          </p>
        </td>
      </tr>

      <!-- RESUMEN DE TU CONSULTA -->
      <tr>
        <td style="padding:28px 32px 0;">
          <div style="background:#EEF8F4;border-radius:14px;padding:22px;border:1px solid #D4EDDF;">
            <p style="margin:0 0 14px;font-size:12px;color:#6E8C80;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">📋 Resumen de tu consulta</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:6px 0;font-size:13px;color:#6E8C80;width:120px;">Modelo:</td><td style="padding:6px 0;font-size:13px;color:#0C2018;font-weight:600;">$modelo</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#6E8C80;">Teléfono:</td><td style="padding:6px 0;font-size:13px;color:#0C2018;">$telefono</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#6E8C80;">Recibido:</td><td style="padding:6px 0;font-size:13px;color:#0C2018;">$fecha</td></tr>
            </table>
          </div>
        </td>
      </tr>

      <!-- PASOS A SEGUIR -->
      <tr>
        <td style="padding:28px 32px 0;">
          <p style="margin:0 0 16px;font-size:13px;color:#6E8C80;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">🗓 ¿Qué sigue ahora?</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="42" valign="top" style="padding:0 12px 16px 0;">
                <div style="width:36px;height:36px;background:linear-gradient(135deg,#3D6CB8,#00C4A7);border-radius:50%;text-align:center;line-height:36px;color:#fff;font-weight:700;font-size:14px;">1</div>
              </td>
              <td valign="top" style="padding:0 0 16px;">
                <p style="margin:0 0 3px;font-size:14px;color:#0C2018;font-weight:700;">Revisamos tu consulta</p>
                <p style="margin:0;font-size:13px;color:#3A5848;line-height:1.5;">Nuestro equipo analiza tu solicitud y prepara una propuesta personalizada.</p>
              </td>
            </tr>
            <tr>
              <td width="42" valign="top" style="padding:0 12px 16px 0;">
                <div style="width:36px;height:36px;background:linear-gradient(135deg,#3D6CB8,#00C4A7);border-radius:50%;text-align:center;line-height:36px;color:#fff;font-weight:700;font-size:14px;">2</div>
              </td>
              <td valign="top" style="padding:0 0 16px;">
                <p style="margin:0 0 3px;font-size:14px;color:#0C2018;font-weight:700;">Te contactamos</p>
                <p style="margin:0;font-size:13px;color:#3A5848;line-height:1.5;">Te respondemos por correo o teléfono en menos de 24 horas hábiles.</p>
              </td>
            </tr>
            <tr>
              <td width="42" valign="top" style="padding:0 12px 0 0;">
                <div style="width:36px;height:36px;background:linear-gradient(135deg,#3D6CB8,#00C4A7);border-radius:50%;text-align:center;line-height:36px;color:#fff;font-weight:700;font-size:14px;">3</div>
              </td>
              <td valign="top">
                <p style="margin:0 0 3px;font-size:14px;color:#0C2018;font-weight:700;">¡Construimos tu hogar!</p>
                <p style="margin:0;font-size:13px;color:#3A5848;line-height:1.5;">La felicidad no se compra, se construye. ✨</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- BOTÓN WHATSAPP -->
      <tr>
        <td style="padding:28px 32px;">
          <div style="background:linear-gradient(135deg,#1B3028,#243C30);border-radius:14px;padding:24px;text-align:center;">
            <p style="margin:0 0 6px;color:rgba(255,255,255,.7);font-size:12px;text-transform:uppercase;letter-spacing:1.5px;">¿Necesitas respuesta inmediata?</p>
            <p style="margin:0 0 18px;color:#fff;font-size:16px;font-weight:700;">Escríbenos directo por WhatsApp</p>
            <a href="https://wa.me/56931846889?text=Hola!%20Soy%20$nombre_corto%20y%20quiero%20información%20sobre%20$modelo"
               style="display:inline-block;background:#25D366;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;font-size:15px;">
              💬 Abrir WhatsApp
            </a>
            <p style="margin:14px 0 0;color:rgba(255,255,255,.5);font-size:12px;">+56 9 3184 6889 · Lunes a Viernes hasta las 17:00 hrs</p>
          </div>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding:20px 32px;background:#EBF7F1;border-top:2px solid #D4EDDF;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:center;padding-bottom:12px;">
                <a href="https://prefabricadaselalba.cl" style="color:#00A58C;text-decoration:none;font-size:12px;font-weight:700;">🌐 prefabricadaselalba.cl</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="https://www.instagram.com/prefabricadaselalba/" style="color:#E1306C;text-decoration:none;font-size:12px;font-weight:700;">📷 Instagram</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="https://web.facebook.com/prefabricadaselalba/" style="color:#4267B2;text-decoration:none;font-size:12px;font-weight:700;">👍 Facebook</a>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;">
                <p style="margin:0;font-size:11px;color:#6E8C80;line-height:1.6;">
                  Av. Calera de Tango, Parcela 8-C, San Bernardo, Región Metropolitana<br>
                  Este correo fue enviado a <strong>$email</strong> porque realizaste una consulta en nuestro sitio web.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body></html>
HTML;

mail($email, $subject_cliente, $body_cliente, $headers_cliente);

echo json_encode(['success' => $ok]);
