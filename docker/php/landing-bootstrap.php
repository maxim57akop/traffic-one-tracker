<?php

$trafficOneBase = $_SERVER['TRAFFICONE_LANDER_BASE'] ?? '';
$trafficOneOfferURL = $_SERVER['TRAFFICONE_OFFER_URL'] ?? '';

ob_start(static function (string $buffer) use ($trafficOneBase, $trafficOneOfferURL): string {
    $output = $buffer;

    if ($trafficOneOfferURL !== '') {
        $output = str_replace(['{{offer}}', '{offer}'], $trafficOneOfferURL, $output);
    }

    if ($trafficOneBase !== '' && stripos($output, '<base ') === false) {
        $baseTag = '<base href="' . htmlspecialchars($trafficOneBase, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">';
        $output = preg_replace('/<head(\s[^>]*)?>/i', '$0' . $baseTag, $output, 1) ?? $output;
    }

    return $output;
});
