<?php header('Access-Control-Allow-Origin: *'); header('Access-Control-Allow-Origin: *');
error_reporting(E_ALL | E_STRICT);
ini_set("display_errors", "1");
$json = '{"application" : "87ccf9c7-93a6-428a-8515-2bdddfded0a2", "language" : "fi" }';
//print "$json\n";
$ret = http_post("https://tanger.belectro.fi/api/v1/maps/list",$json);
print $ret;
  
function http_post($url, $data) {
    $curl = curl_init($url);
    curl_setopt($curl, CURLOPT_HEADER, false);
    curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($curl, CURLOPT_HTTPHEADER,
            array("Content-type: application/json"));
    curl_setopt($curl, CURLOPT_POST, true);
    curl_setopt($curl, CURLOPT_POSTFIELDS, $data);
    $json_response = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
/*
    if ( $status != 201 ) {
        die("Error: call to URL $url failed with status $status, response $json_response, curl_error " . curl_error($curl) . ", curl_errno " . curl_errno($curl));
    }
*/    
    curl_close($curl);
    return $json_response;
}  
?>