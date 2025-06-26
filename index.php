<?php header('Access-Control-Allow-Origin: *');   // muista poistaa tuo Access-Control-Allow-Origin!!!
error_reporting(E_ALL | E_STRICT);
ini_set("display_errors", "1");

// Change the following address to the one that is admin for this service
$EmailToPostInfoFromNewUsers = "vesal@jyu.fi";
$replyNames = array();

// =============================================================================================
// Service for saving user's current gps position and his track log.
// Mainly made for use with CycloLite, but other similar clients for
// sending the position and following others could also be made.
// See: https://trac.cc.jyu.fi/projects/dotnet/wiki/CycloLite
//
// If php is run in safe-mode, then some initializations is needed before first usage.
// This is done by running the script form command line like:
//
//    php index.php create
//
// This command makes temp-directory
//
//  temp             - directory to write temporary users if
//                     the script can not be create directory + files (php SAFE_MODE_ON)
//                     (see: http://php.net/manual/en/features.safe-mode.php)
//                   - when SAFE_MODE_ON, the new user is done under
//                     temp like:  "temp/vesal@jyu.fi user.txt"
//                   - Running this script form command line like:
//                      php index.php vesal@jyu.fi
//                     moves all users files "temp/vesal@jyu.fi *"
//                     to users directory "vesal@jyu.fi/*"
//
// In www-mode this service makes following directories and files to the server
// User vesal@jyu.fi used as an example:
//  vesal@jyu.fi     - own directory for every user with his/her email-address
//     user.txt      - file with two lines.  First is oldid and next is newid (ordered by email)
//                     if user has used his newid, then both lines are same.
//                     id's are saved as crypted.
//     active.txt    - file that has one line, f.ex 123 for to active (last used) log id
//     active.grant  - who are granted to find the active logname?  If this file is missing, it is same as all.
//     default.grant - who has rights to follow as default.  This can be overridden by  grants to logname.
//                     as a default there is no default, so no default rights
//     trust.grant   - if you are using many your own emails or you have a very trusted friend, you can
//                     grant rights for log id named "trust" and then it behaves just like
//                     your own email.  Do not give all rights for * f.ex
//     123.last      - file for log with logname 123 with one line for current pos,
//                     like: 62.2996956,25.7324266,0,433,41478.4036846991,2.390,254.9,3.0,3.0
//     123.cyc       - all lines that user has send for this log (with id 123)
//     123.grant     - one line with granted users email addresses separated by comma
//                     or just * or all for grant any logged user to follow
//
// GET or POST requests:
//   order=1&e=vesal@jyu.fi - order new userid (passwd) by email
//                          - return OK - New passwd sent
//   order=1&e=vesal@jyu.fi&returl=https://www.mit.jyu.fi/demowww/cyclo/k.html?id=
//                          - order new userid and add to email link to return url and and the new id at the end of the URL
//   e=vesal@jyu.fi&id=12342345&d=62.2996956,25.7324266,0,433,41478.4036846991,2.390,254.9,3.0,3.0
//                          - send new datapoint
//                          - return OK
//   e=vesal@jyu.fi&id=12342345&log=123&g=vesal@kave.fi,ji@jyu.fi,family
//                          - grant those users to follow you (all or * = everybody)
//                            because family is not email, it is used as a log name
//                            and then family.grant is looked for more rights (recursive)
//                            so giving rights for log names, you can use them as groups
//                          - return OK - grant
//   e=vesal@jyu.fi&id=12342345&g=vesal@kave.fi,ji@jyu.fi,family
//                          - grant to find active log id (notice, no log parameter).
//                            if the users is granted to do this, he may still not be granted
//                            for the active log.
//                          - return OK - grant
//   e=vesal@jyu.fi&id=12342345&log=123&qg=1
//                          - query grant for users allowed to follow you
//                          - return vesal@kave.fi,ji@jyu.fi
//   e=vesal@jyu.fi&id=12342345&qg=1
//                          - query grant for users allow to find active logname
//                          - return vesal@kave.fi,ji@jyu.fi
//   e=vesal@kave.fi&id=6612345&f=vesal@jyu.fi/123
//                          - ask for last position for user vesal@jyu.fi from log 123
//                          - user need to be granted to follow this log
//                          - return: D:vesal@jyu.fi/123=62.2996956,25.7324266,0,...
//                          - in case of error return f.ex E:vesal@jyu.fi/123=no rights
//                          - there could be many emails separated by comma for f,
//                            then as many D: (or E:) lines are returned.
//                            This is on of the requests that may return more than on line.
//                          - There are two special follow names:
//                              - me   = alias for user himself
//                              - test = gives test data for testing purposes
//                                       then test/1 is from separate postion than test/2
//   e=vesal@kave.fi&id=6612345&f=vesal@jyu.fi
//                          - ask for last position for user vesal@jyu.fi from his active log
//                          - user vesal@kave.fi needs to be granted to find the active log
//                            (or no one has active grant)
//                            and needs also the grant for the active log.
//   source=1               - print this source file as text
//   e=vesal@kave.fi&id=6612345&dir=*
//                          - ask dir listing of all logs
//   e=vesal@kave.fi&id=6612345&getlog=vesal@jyu.fi/123
//                          - get log user must have granted to that log
//   e=vesal@kave.fi&id=6612345&saveRoute=!sm18/2.txt&data=routedata...
//                          - save route by name 2.txt
//   e=vesal@kave.fi&id=6612345&getRoute=!sm18/2.txt
//                          - load route by name 2.txt
//
// Return format is text/plain
// All requests may also return ERROR: and a message for error
// If there are errors in f-request, they are between D: lines marked by E:
//
// User can order a new id, but he can use his/her old id until he/she uses the new one for first
// time.  So if somebody spams with new requests, it does not disturp the current usage.
// All other requests except order=1 needs both email and correct id, otherwise ERROR: is returned.
//
// Author:  Vesa Lappalainen (vesal@jyu.fi)
// Version: 31.07.2013

// =============================================================================================
//  Main program
// =============================================================================================

// is it run from commandline or from http?
if ( isset($argv) >= 1 ) commandline($argv);

header("Content-Type: text/plain");
$basedir = dirname($_SERVER["SCRIPT_FILENAME"]);
if ( !chdir($basedir) ) error("can not change to base dir");

$params = $_REQUEST;
$request = "";  // implode("&",$params);

// Collect params. Names starting by u is urlencoded and needs to be decoded by %40 => @ before usage
$source=uparam("source");       // ask for source
$email=atreplace(uparam("e"));  // email address e=vesal@jyu.fi
$id=uparam("id");               // users id=123456790
$order=uparam("order");         // order new id order=1 /for user $email
$logname=uparam("log");         // users logname for current trac log=234, used only with d,g and qg
$getlogname=param("getlog");   // users get logname for current trac log=234
$data=param("d");               // data d=62.2996956,25.7324266,0,433,41478.4036846991,2.390,254.9,3.0,3.0
$ugrant=uparam("g");            // grant rights for users for this logname g=vesal@cc.jyu.fi,ji@jyu.fi or g=*
$getgrant=uparam("qg");         // query granted rights for users for this logname
$ufollow=uparam("f");           // follow user f=vesal@jyu.fi/234,ji@jyu.fi/333
$dirlist=uparam("dir");         // get dir listing
$saveRoute=udparam("saveRoute"); // name for route
$getRoute=udparam("getRoute");   // name for route
$file=udparam("file");           // content of the file
$returl=udparam("returl");       // url to write to id-email

date_default_timezone_set('UTC');

if ( $source != null ) printSource();
if ( $getRoute != null && strpos($getRoute, '!') === 0 ) getRoute($email,$getRoute);
if ( empty($email) ) error("Must use email");
$email = strtolower($email);
if ( $order != null ) sendId($email); // order=1&e=vesal@jyu.fi
checkId($email,$id);
if ( $getRoute != null ) getRoute($email,$getRoute);
if ( $saveRoute != null ) saveRoute($email,$saveRoute, $file);
if ( $data != null ) saveData($email,$logname,$data);
if ( $ugrant != null ) grantUsers($email,$logname,$ugrant);
if ( $getgrant != null ) getGrant($email,$logname);
if ( $getlogname != null ) getLogName($email, $getlogname, $ufollow);
if ( $ufollow != null ) follow($email,$ufollow);
if ( $dirlist != null ) getLogs($email,$dirlist);
follow($email,"me"); // if no f-param, then follow me (user himself)
error("unknown function");


// =============================================================================================
//  Functions
// =============================================================================================

// =============================================================================================
function param($name) {
// gets the GET or POST parameter with name $name.
// also saves the request info for log-file
   global $params;
   global $request;
   $p = null;
   if ( isset($params["$name"]) ) $p = trim($params["$name"]);
   $lp = $p;
   if ( $name == "id" ) $lp = "xxxx";
   if ( $p != "" ) $request = "$request&$name=$lp"; // for logging
   return $p;
}


// =============================================================================================
function uparam($name) {
// gets the GET or POST parameter with name $name and urlencode it
// also saves the request info for log-file
   return urlencode(param($name));
}


// =============================================================================================
function udparam($name) {
// gets the GET or POST parameter with name $name and urldecode it
// also saves the request info for log-file
   return urldecode(param($name));
}


// =============================================================================================
function atreplace($s,$r1=false,$r2=false,$r3=false,$r4=false) {
// replaces %40 in in url-encoded string by @
// also optionally chars , / * could be decoded.
  $ret = $s;
  $reps = array($r1,$r2,$r3,$r4);
  $strs = array("," => "2C", "/" => "2F", "*" => "2A", ";" => "3B");
  foreach ( $reps as $r ) {
     if ( $r ) {
       $value = $strs[$r];
	   if ( $value ) $ret=str_replace("%$value","$r",$ret);
	 }
  }
  return str_replace("%2B","+",str_replace("%40","@",$ret));
}


// =============================================================================================
function printSource() {
// prints this file
   $lines = rfile($_SERVER["SCRIPT_FILENAME"]);
   foreach ( $lines as $line ) print "$line\n";
   writeLog("SOURCE");
   exit;
}


// =============================================================================================
function cycdir($email) {
// give the name pre-part either form users directory or from temp
// try vesal@jyu.fi/user.txt, if exists return "vesal@jyu.fi/" (urlencoded)
// otherwise return "temp/vesal@jyu.fi " (urlencoded)
   $uencEmail = atreplace(urlencode($email));
   $dir = "$uencEmail/";
   // if ( file_exists("$dir" ."user.txt") ) return $dir;
   if ( file_exists("$dir" ) ) return $dir;
   return "temp/$uencEmail ";
}


// =============================================================================================
function tryCreate($email,$filename) {
// tries first if allready vesal@jyu.fi/filename, return the name if exists
// if the dir does not exist, create the dir and try to create the file,
// if ok, return the name, if not ok, return temp file
   $uencEmail = atreplace(urlencode($email));
   $dir = "$uencEmail/";
   $name = "$dir$filename";
   if ( file_exists("$name") ) return "$name";
   if ( !file_exists($dir) ) {
       if ( !mkdir($dir) ) error("Can not make $email");
       if ( chmod($dir,0777) ) {
	   }
   }
   if ( writefile($name,"") ) return $name;
   $name = cycdir($email) . $filename;
   // print "Name: $name\n";
   if ( file_exists("$name") ) return "$name";
   if ( writefile($name,"") ) return $name;
   error("Can not make temp $email");
}


// =============================================================================================
function follow($email,$ufollow) {
// sends current lines from users to follow
   $follow=atreplace($ufollow,",","/","*",";");
   $follow=str_replace(";",",",$follow);
   $users = explode(",",$follow);
   $msg = "";
   foreach ( $users as $userToFollow ) $msg = $msg . followOne($email,$userToFollow);
   writeLog($msg);
   exit;
}

// =============================================================================================
function testData($logname) {
// gives testdata for this logname.  testdata is a part of normal log starting from my home
// and gives a next step in every reguest.  Rounds to begining after end
   $n = rfile("test/$logname-n.txt");
   $i = 0;
   if ( $n != null ) $i = $n[0];
   $data = rfile("test/test.cyc");
   $line = $data[$i];
   $line = str_replace("/123","/$logname",$line);
   print "$line\n"; // D:vesal@jyu.fi/123=62.2996956,25.7324266,0,...
   $i = $i + 1;
   if ( $i >= count($data) ) $i = 0;
   writefile("test/$logname-n.txt","$i\n");
   return "D";
}

// =============================================================================================
function followOne($email,$userToFollow) {
// sends one users line.  If no logname, find the active one
   global $replyNames;
   if ( startsWith($userToFollow,"%21") ) return followOpenData($email,$userToFollow);
   list ($followEmail,$logname) = explode("/",$userToFollow . "/");
   $followEmail = strtolower($followEmail);
   $replyEmail = getReplyName($userToFollow);
   $replyEmailTemp = $replyEmail;
   $n = 1;
   while ( isset($replyNames[$replyEmail]) ) $replyEmail = $replyEmailTemp . $n;
   if ( !isset($replyNames[$replyEmail]) ) $replyNames[$replyEmail] = 1;
   if ( $followEmail == "test" ) return testData($logname);
   if ( $followEmail == "me" ) { $followEmail = $email; }
   $trust = checkGrant(purifyEmail($email),$followEmail,"trust");
   if ( $logname == "" ) { // if no loggid, pick the active logname for userToFollow
      if ( !$trust ) {
        if ( !checkGrant(purifyEmail($email),$followEmail,"active") ) { print "E:$followEmail=no rights to find active log name\n"; return "Eag"; }
      }
      $lines = rfile(cycdir($followEmail) . "active.txt");
	  if ( $lines == null || count($lines) == 0 ) { print "E:$userToFollow=no active data\n"; return "Ead"; }
	  $logname = $lines[0];
   }
   if ( !$trust && !checkGrant(purifyEmail($email),$followEmail,$logname) ) { print "E:$followEmail/$logname=no rights\n"; return "Er"; }
   $data = rfile(cycdir($followEmail) . "$logname.last");
   if ( $data == null || count($data) == 0 ) { if ( $email != "open" ) print "E:$followEmail/$logname=no data\n"; return "Ed"; }
   print "D:$replyEmail=$data[0]\n"; // D:vesal@jyu.fi/123=62.2996956,25.7324266,0,...
   return "D";
}

// =============================================================================================
function followOpenData($email,$userToFollow) {
// Read users to follow from !sm14/140608 and follow all of them with full rights
  $openUsers = readOpenData($userToFollow);
  $msg = "";
  foreach( $openUsers as $key => $value ) {
     # print "$value\n";
	 $msg = $msg . followOne("open",$value . "/" . datename());
  }
  return $msg;
}


// =============================================================================================
function checkGrant($email,$followEmail,$logname) {
// check if email is granted to follow followEmail and logname
   if ( $email == "open" ) return true;             // always allowed to follow open
   if ( $email == purifyEmail($followEmail) ) return true;       // always allowed to follow itself
   $grant = rfile(cycdir($followEmail) . "$logname.grant");
   // print "$email $followEmail $logname\n";
   // print_r($grant);
   if ( $grant == null ) {                          // no grant file
      if ( $logname == "active" ) return true;      // for active default grant is all
      if ( $logname == "trust" ) return false;      // no default for trust
      $grant = rfile(cycdir($followEmail) . "default.grant"); // is there default grants?
	  if ( $grant == null ) return false;           // no grant if there is no default
   }
   if ( count($grant) < 1 ) return false;           // no grant
   $gr = trim($grant[0]);
   if ( $gr == "all"  ) return true;                // everybody granted
   if ( $gr == "*"  ) return true;                  // there is * (TODO: do reg exp better)
   // print "F,$gr," ." T ". ",$email," . "\n";
   $p = strpos(",$gr,",",$email,");
   if ( !($p === false) ) return true;              // email found
   // recurse all names that have no @
   $groups = explode(",",$gr);
   foreach ( $groups as $group ) {
      $group = trim($group);
      // print "$group\n";
      if (  strpos($group,"@") ) continue;
      // print "$group\n";
	  if ( checkGrant($email,$followEmail,$group) ) return true;
   }

   return false;
}

// =============================================================================================
function getLogs($email,$mask)
// returns all log names from user
{
    $mask = str_replace("%2A","*",$mask);
    $mask = str_replace("*",".*",$mask);
	$mask = "/^".$mask."$/";
	// print $mask;
	$dirname=cycdir($email);
	// print("$dirname\n");
	if ($handle = opendir($dirname)) {
		while (false !== ($entry = readdir($handle))) {
			// print("$entry\n");
		    if ( preg_match("/^.*\.cyc$/", $entry) ) {
			   $entry = str_replace(".cyc","",$entry);
		       // print "$entry\n";
			   if ( preg_match($mask, $entry) )
			      print "$entry\n";
			}
		}
		closedir($handle);
	}
	writeLog("dir");
	exit;
}

function isGlobalFollow($followEmail, $logname, $ufollow) {
// check if there is global access for $logname thru some $ufollow that is !sm18 or like that
	$ufollow = urldecode($ufollow);
	// print("isGlobalFollow\n" . $followEmail . "\n" . $logname . "\n" . $ufollow . "\n");
	$follow=atreplace($ufollow,",","/","*",";");
    $follow=str_replace(";",",",$follow);
    $users = explode(",",$follow);
	foreach ( $users as $userToFollow ) {
		// print($userToFollow . "\n");
		if ( !startsWith($userToFollow,"!") ) continue;
		$lines = rfile($userToFollow . "/" . $logname);
		if ( $lines == null ) continue;
   	    foreach ( $lines as $user ) {
		   // print($user . "\n");
		   if ( $followEmail === $user ) return true;
		}
	}
    // $openUsers = readOpenData($userToFollow);
    // foreach( $openUsers as $key => $value ) {
    return false;
}


// =============================================================================================
function getLogName($email,$getlogname, $ufollow)
// returns logdata
{
   list ($followEmail,$logname) = explode("/",$getlogname);
   $followEmail = strtolower($followEmail);

   $trust = checkGrant(purifyEmail($email),$followEmail,"trust");
   if ( !$trust ) {
	  $trust = checkGrant(purifyEmail($email),$followEmail, $logname);
   }
   if ( !$trust ) {
	  $trust = isGlobalFollow($followEmail, $logname, $ufollow);
   }
   if ( !$trust ) {
	   print("ERROR: No rights for " . $getlogname);
	   exit;
   }
   if ( !file_exists($getlogname . ".cyc") ) {
	   print("ERROR: No log " . $getlogname);
	   exit;
   }

   $result = rfile($getlogname . ".cyc");
   foreach( $result as $key => $value )
	  print($value . "\n");
   exit;
}


// =============================================================================================
function getGrant($email,$logname) {
// send grants for email, logname
   if ( empty($logname) )  $logname = "active"; //error("needs log id");
   $grant = rfile(cycdir($email) . "$logname.grant");
   // print "$email $logname $grant\n";
   if ( $grant == null ) {
      if ( $logname == "trust" ) answer("-");
	  if ( $logname == "active" ) answer("all");
	  if ( $logname == "default" ) answer("-");
	  getGrant($email,"default");
      //answer("-");
   }
   if ( count($grant) < 1 ) { answer("-"); }
   answer($grant[0]);
   exit;
}


// =============================================================================================
function grantUsers($email,$logname,$ugrant) {
  $grant = atreplace($ugrant,",","*",";");
  $grant = str_replace(";",",",$grant);
  $grant = strtolower($grant);
// saves the users datapoint to last and to trace-file (.cyc)
  if ( empty($logname) ) $logname = "active"; // error("needs log id");
  // if ( !preg_match("/^[A-Za-z@0-9.,]+$/", $data) ) error("wrong email format");
  if ( !writefile(cycdir($email) . "$logname.grant","$grant\n") ) error("grant could be not written");
  ok("granted");
}


// =============================================================================================
function saveData($email,$logname,$data) {
// saves the users datapoint to last and to tracfile (.cyc)
  if ( empty($logname) ) error("needs log name");
  if ( startsWith($logname,"%21") ) saveOpenData($email,$logname,$data);
  if ( !preg_match("/^[-0-9.,Na]+$/", $data) ) error("wrong data format");
  $d = cycdir($email);
  if ( !writefile("$d$logname.last","$data\n") ) error("$d$logname.last" . " data line could be not written");
  if ( !writefile("$d$logname.cyc","$data\n","a") ) error("log line could be not written");
  // print "$data\n";
  writefile($d."active.txt","$logname\n");
  ok("");
}


// =============================================================================================
function saveRoute($email,$routename,$file) {
// saves route tuo ! directory or to users directory
  $em = purifyEmail($email);
  $file = str_replace("\\", "", $file);
  if (!startsWith($routename,"!") && !startsWith($routename,"$em/") ) {
    error("No right to save: $routename $email");
  }
  if (strrpos($routename,".txt") === false ) error("Only .txt can be saved: $routename");
  if ( !writefile("$routename","$file") ) error("Could be not write $routename");
  ok("$routename");
}


// =============================================================================================
function getRoute($email,$routename) {
// saves the users datapoint to last and to tracfile (.cyc)
  if (!startsWith($routename,"!") && !startsWith($routename,$email."/") ) {
    error("No right to read: $routename");
  }
  if (strrpos($routename,".txt") === false ) error("Only .txt can be read: $routename");
  // print("filename: $routename\n");
  $result = rfile($routename);
  // print("result: $result \n");
  foreach( $result as $key => $value )
	  print($value . "\n");
  exit;
}


// =============================================================================================
function openDirName($logname) {
// return the open dir name from logname
  if ( !startsWith($logname,"%21") ) return "";
  return "!" . substr($logname,3);
}

// =============================================================================================
function datename() {
// returns a name made from date
  return date("ymd");
}

// =============================================================================================
function readOpenData($logname) {
// reads the opendata user names
  if ( !startsWith($logname,"%21") ) return array();
  $dirname = openDirName($logname);
  if ( !file_exists($dirname) ) { mkdir($dirname,0777); return array(); }
  $name = datename();
  $lines = rfile("$dirname/$name");
  // print "$dirname/$name\n";
  if ( $lines == null ) return array();
  return $lines;
}

// =============================================================================================
function checkUser($logname,$email) {
// check if user exists in $openUsers, if not, add and write to file
  // print $openUsers;
  $openUsers = readOpenData($logname);
  foreach( $openUsers as $key => $value ) {
     # print "$value\n";
     if ( $value == $email ) return;
  }
  array_push($openUsers,$email);
  $name = openDirName($logname) . "/" . datename();
  writelinesfile($name,$openUsers);
}

// =============================================================================================
function saveOpenData($email,$logname,$data) {
// saves the users open datapoint to last and to tracfile (.cyc)
   checkUser($logname,$email);
   saveData($email,datename(),$data);
}

// =============================================================================================
function purifyEmail($email) {
// Purify email from  vesal+vl@jyu.fi  => vesal@jyu.fi
  $i = strpos($email,"+");
  if ( !$i ) return $email;
  $p = strpos($email,"@");
  $ret = $email;
  if ( $p < $i )
    $ret = substr($email,0,$i);
  else
    $ret = substr($email,0,$i) . substr($email,$p);
  // print "$ret\n";
  return $ret;
}

// =============================================================================================
function getReplyName($email) {
// Get just the + part from email,
//     vesal+vl@jyu.fi  => vl
//     vesal@jyu.fi+vl/123  => vl
  $i = strpos($email,"+");
  if ( !$i ) return $email;
  $p = strpos($email,"@");
  $ret = $email;
  if ( $p < $i )
    $ret = substr($email,$i+1);
  else
    $ret = substr($email,$i+1,$p-$i-1);
  // print "$ret\n";
  $i = strpos($ret,"/");
  if ( $i ) $ret = substr($ret,0,$i);
  return $ret;
}


// =============================================================================================
function checkEmailDir($email) {
// Check if dir exists and if not, create one
   if ( !file_exists($email) ) {
     mkdir($email,0777);
     chmod($email,0777);
   }
   return true;
}

// =============================================================================================
function checkId($email,$id) {
// check the user  id,
// first check the first line in user file, if that is ok, then ok (old passwd id)
// if not ok, check next line (new passwd id), if that ok, change both line for new and ok
   // if ( !preg_match("/^[A-Za-z@0-9.,]+$/", $email) ) error("wrong email format");
   if ( empty($id) ) error("id is missing");
   if ( !preg_match("/^[0-9]+$/", $id) ) error("id can be only numbers");
   $name = cycdir(purifyEmail($email)) . "user.txt";
   // print "$name\n";
   $lines = rfile("$name");
   if ( $lines == null || count($lines) < 2 ) error("user $email not logged, order first an id");
   if ( crypt($id,$lines[0]) == $lines[0] ) { return checkEmailDir($email); }
   if ( crypt($id,$lines[1]) == $lines[1] ) { writefile($name,"$lines[1]\n$lines[1]\n"); return checkEmailDir($email); }
   error("wrong id $id");
}


// =============================================================================================
function rfile($name) {
// read a file and if not exist return null, otherwise return the file as an array of strings
   if ( !file_exists($name) ) return null;
   $lines = file("$name");
   if ( $lines == null ) return null;
   foreach( $lines as $key => $value ) {
     $lines[$key] = str_replace("\n","",$lines[$key]);
     $lines[$key] = str_replace("\r","",$lines[$key]);
   }
   return $lines;
}


// =============================================================================================
function writeLog($msg) {
  global $request;
  writefile("log.txt",date('Ymd His') . "Z: $request => $msg\n","a");
}


// =============================================================================================
function answer($msg) {
// writes answer to the client and logs it also
   print "$msg";
   writeLog($msg);
   exit;
}

// =============================================================================================
function error($msg) {
// prints the error message and quits
  answer("ERROR: $msg");
}


// =============================================================================================
function ok($msg) {
// prints OK and exits
  if ( empty($msg) ) answer("OK");
  answer("OK: $msg");
}


// =============================================================================================
function writefile($name,$lines,$method="w") {
// writes lines (string) to the file
  $fw = @fopen("$name", $method.'b');
  if ( !$fw ) return false;
  // print "aukesi";
  if ( fwrite($fw,$lines) === false ) return false;
  fclose($fw);
  return true;
}

// =============================================================================================
function writelinesfile($name,$lines,$method="w") {
// writes lines (array) to the file
  $fw = @fopen("$name", $method.'b');
  if ( !$fw ) return false;
  // print "aukesi";
  foreach( $lines as $key => $value ) {
    if ( fwrite($fw,"$value\r\n") === false ) return false;
  }
  fclose($fw);
  return true;
}

// =============================================================================================
function checkHtaccess() {
// check if there is a htaccess file and if not, create that:
   $name = ".htaccess";
   if ( file_exists($name) ) return;
   $htaccess =
     "Options -Indexes\n".
     "Order Deny,Allow\n".
     "Deny from All\n".
     "\n".
     "<Files index.php>\n".
     "  Order Allow,Deny\n".
     "  Allow from all\n".
     "</Files>\n".
     '<Files "">'."\n".
     "  Order Allow,Deny\n".
     "  Allow from all\n".
     "</Files>"
   ;
   writefile($name,$htaccess);
}

// =============================================================================================
function startsWith($s, $start)
// return true if $start in begining of $s
{
    return $start === "" || strpos($s, $start) === 0;
}

// =============================================================================================
function sendId($email) {
// Params: order=1&e=vesal@jyu.fi
// Create new id for user and save it to file user.txt and also send by email to user.
// If php run in safe mode, the file is created in temp and a message is sent to admin
//
  global $EmailToPostInfoFromNewUsers;
  global $returl;
  $email = purifyEmail($email);
  checkHtaccess();
  $newid = rand(10000,99999) . "" . rand(10000,99999);
  $crNewid = crypt($newid);
  $name = tryCreate($email,"user.txt");
  $lines = rfile("$name");
  $crUserid = $crNewid;
  if ( $lines != null && count($lines) > 0 ) $crUserid = $lines[0];
  if ( !writefile("$name","$crUserid\n$crNewid\n") )  error("Can not write userfile");
  if ( $lines == null ) {
      $message = "New CycloLite user: $email";
      if ( startsWith($name,"temp") ) $extraMsg = "See $name\nRun: php index.php $email";
      $ok = mail( "$EmailToPostInfoFromNewUsers" , "New user $email" , $message);
      if ( !$ok ) error("Can not send mail $email");
	  // ok("You new id will be sent in few hours");
  }
  $url = "";
  if ( $returl ) {
    $url = "\n\n$returl$newid";
    $returl = trim($returl);
  }
  $ok = mail( purifyEmail($email) , "New CycloLite Id" , "CycloID: $newid$url");
  if ( !$ok ) error("Can not send mail $email");
  ok("New id sent, check your email: $email.");
}


// =============================================================================================
function commandline($argv) {
// Fixes the new users directory not working in php SAFE_MODE_ON
// or create the needed new directories
	$basedir = dirname($_SERVER["SCRIPT_FILENAME"]);
	chdir($basedir) or die("can not change to base dir");
	print getcwd() . "\n";

	// Instructions if not email argument
	if ( count($argv) < 2 ) {
	  print "\n";
	  print "  Please give the user's email as a parameter!\n";
	  print "  Or on first use give parameter\n";
      print "	  create\n";
	  print "  to create needed directories.\n\n";
	  exit;
	}

	// vesal@jyu.fi => vesal@jyu.fi
	$dir=atreplace(urlencode($argv[1]));

	// Check if need to create the temp directory
    if ( $dir == "create" ) {
	   print "Creating temp-directory\n";
	   mkdir("temp") or die ("temp allready exists");
	   chmod("temp",0777);
	   chmod(".",0777);
	   exit;
    }

	print "$dir\n";
	// remove the dir made by Apache-user and create it again.
	rmdir($dir);
	mkdir($dir);
	chmod($dir,0777);

	// rename("temp/$dir *","$dir/*");
	$files = scandir("temp");

	$n = strlen($dir);
	foreach( $files as $key => $file ) {
	  if ( strpos($file,$dir) === false ) continue;
	  $name = substr($file,$n+1);
	  rename("temp/$file","$dir/$name");
	  print "temp/$file => $dir/$name\n";
	}
	exit;
}
?>
