<?php header('Access-Control-Allow-Origin: *'); header('Access-Control-Allow-Origin: *');
// Proxy server for getting IGC files from XContest, but works also for getting any file
error_reporting(E_ALL | E_STRICT);
ini_set("display_errors", "1");
$json = '{"application" : "87ccf9c7-93a6-428a-8515-2bdddfded0a2", "language" : "fi" }';
//print "$json\n";
if (php_sapi_name() == "cli") {
    parse_str($argv[1], $_GET);
}
$u=$_GET['u'];
$ret = http_get($u);
//$ret = http_get("https://www.mit.jyu.fi/demowww/cyclo/k.html");
print $ret;

function http_get($url) {
    $curl = curl_init($url);
    curl_setopt($curl, CURLOPT_HEADER, false);
    curl_setopt($curl, CURLOPT_POST, false);
	  curl_setopt($curl, CURLOPT_REFERER, "https://www.xcontest.org");
	  curl_setopt($curl, CURLOPT_FOLLOWLOCATION, true); // seuraa uudelleenohjauksia
    curl_setopt($curl, CURLOPT_RETURNTRANSFER, true); // palauta data, ei tulosta
    curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, false); // testaa ilman SSL-tarkistusta
    //curl_setopt($curl, CURLOPT_POSTFIELDS, $data);
    $json_response = curl_exec($curl);
    if ($json_response === false) {
        die("CURL ERROR: " . curl_error($curl));
    }
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    if ( $status != 201 && $status != 200) {
        die("ERROR: call to URL $url failed with status $status");
    }
    curl_close($curl);
    return $json_response;
  //return file_get_contents($url);
}
?>
