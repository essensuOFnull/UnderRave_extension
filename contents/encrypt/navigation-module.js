var navigationModule = function(){

	this.key = "";
	this.author = "";

	var getRequestParams = function(prmstr){
	    var params = {};
	    var prmarr = prmstr.split("&");
	    for ( var i = 0; i < prmarr.length; i++) {
	        var tmparr = prmarr[i].split("=");
	        params[tmparr[0]] = tmparr[1];
	    }
	    return params;
	};

	// returns previous value if different
	this.updateNavigationState = function(search, address){
		
		var params = getRequestParams(search);

		var result = null;

		if (configuration.currentMode == configuration.desktopMode){

			// "sel" - general name for the selected dialog, be it conference or not.
			if (params["sel"]){
				if (this.key != params["sel"]) result = this.key;
				this.key = params["sel"];
			}
			else{
				this.key = "";
			}

			return result;
		}

		if (configuration.currentMode == configuration.desktopMode_v2024){

			var marker = "/im/convo/";
			var dialogIdStartIndex = address.indexOf(marker);
			if (address.indexOf(marker) == -1){
				this.key = "";
				return result;
			}

			var dialogId = address.substring(dialogIdStartIndex + marker.length).split("?")[0];

			if (dialogId){
				if (this.key != dialogId){
					result = this.key;
				}

				this.key = dialogId;
			}
			else{
				this.key = "";
			}

			return result;
		}

		if (configuration.currentMode == configuration.mobileMode){
			// For mobile version - "peer" is used for dialogs, "chat" is used for conferences.
			if (params["peer"]){
				if (this.key != params["peer"]) result = this.key;
				this.key = params["peer"];
			}
			else if (params["chat"]) {
				if (this.key != params["chat"]) result = this.key;
				this.key = "c" + params["chat"];
			}
			else{
				this.key = "";
			}

			return result;
		}
	};

	this.setAuthor = function(auth){
		if (this.author != auth){
			configuration.clearAll();
			this.author = auth;
		}
	};

	this.isConference = function(){
		if (configuration.currentMode == configuration.desktopMode_v2024){
		  	var num = Number(key);
  			var isNumber = Number.isInteger(num) && !isNaN(num); 
			return key.length == 10 && key.indexOf("2") == 0 && isNumber;
		}

		return key.indexOf("c") != -1;
	};

	return this;
}();