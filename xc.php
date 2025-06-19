<?php
// Näytä virheet
ini_set('display_errors', 1);
error_reporting(E_ALL);


// Tarkista t-parametri
if (!isset($_GET['t'])) {
    header("HTTP/1.1 400 Bad Request");
    header("Content-Type: text/plain; charset=utf-8");
    echo "Parametri 't' puuttuu.";
    exit;
}

$t = $_GET['t']; // Esim: !sm25/r.txt

// Selvitä tiedostopolku
// $taskFile = dirname(__FILE__) . '/' . $t;
$taskFile = getcwd() . '/' . $t;
$basename = basename($t); // esim. r.txt
$nameOnly = preg_replace('/\.txt$/', '', $basename); // esim. r

if (!file_exists($taskFile)) {
    header("HTTP/1.1 404 Not Found");
    header("Content-Type: text/plain; charset=utf-8");
    echo "Tiedostoa ei löydy: " . htmlspecialchars($t);
    exit;
}

// Suorita Python-ohjelma stdin/stdoutin yli
$cmd = escapeshellcmd("./xc2.py");
// $cmd = "/usr/bin/env python xc2.py";
$descriptorspec = array(
    0 => array("pipe", "r"), // stdin
    1 => array("pipe", "w"), // stdout
    2 => array("pipe", "w")  // stderr
);

$process = proc_open($cmd, $descriptorspec, $pipes);

if (is_resource($process)) {
    fwrite($pipes[0], file_get_contents($taskFile));
    fclose($pipes[0]);

    $output = stream_get_contents($pipes[1]);
    fclose($pipes[1]);

    $error = stream_get_contents($pipes[2]);
    fclose($pipes[2]);

    $exitCode = proc_close($process);

    if ($exitCode !== 0) {
        header("HTTP/1.1 500 Internal Server Error");
        header("Content-Type: text/plain; charset=utf-8");
        echo "Virhe Python-ohjelmassa:\n" . $error;
        exit;
    }

    // Onnistui
    header("Content-Type: application/xctsk");
    header("Content-Disposition: attachment; filename=\"" . $nameOnly . ".xctsk\"");
    echo $output;
} else {
    header("HTTP/1.1 500 Internal Server Error");
    header("Content-Type: text/plain; charset=utf-8");
    echo "Python-ohjelmaa ei voitu käynnistää.";
}
