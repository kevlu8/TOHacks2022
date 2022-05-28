if (document.cookie.length > 0) {
	console.log(document.cookie);
	document.getElementById("btn-login").innerHTML = "Logout";
	document.getElementById("btn-register").remove();
	document.getElementById("btn-login").onclick = function() {
		window.location.href = "/logout";
	}
} else {
	console.log("nothing")
}