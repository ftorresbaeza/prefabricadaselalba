<?php
/**
 * fotos-data.php — Casas Prefabricadas El Alba
 * Escanea automáticamente assets/casas/ y devuelve JSON con todas las fotos
 * por carpeta. Las fotos de planos se mandan siempre al final.
 * Usado vía fetch() desde catalogo.html con fallback a datos hardcodeados.
 */
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: public, max-age=300'); // 5 min de caché
header('Access-Control-Allow-Origin: *');

$baseDir = realpath(__DIR__ . '/../assets/casas');
$data    = array();

if ($baseDir && is_dir($baseDir)) {
    $dirs = array_diff(scandir($baseDir), array('.', '..'));
    foreach ($dirs as $dir) {
        $path = $baseDir . DIRECTORY_SEPARATOR . $dir;
        if (!is_dir($path)) continue;

        $normales = array();
        $planos   = array();

        foreach (array_diff(scandir($path), array('.', '..')) as $f) {
            $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
            if (!in_array($ext, array('jpg','jpeg','png','webp','gif'))) continue;
            // Planos al final
            if (stripos($f, 'plano') !== false) {
                $planos[] = $f;
            } else {
                $normales[] = $f;
            }
        }
        natsort($normales);
        natsort($planos);
        $data[$dir] = array_values(array_merge($normales, $planos));
    }
}

echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
