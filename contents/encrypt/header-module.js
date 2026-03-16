var headerModule = function(){

	var getResultObject = function(){
		return {
			result : false,
			version : configuration.version,
			date : "",
			seed : "",
			message : ""
		};
	};

	var checkHeader01 = function(message,length,result){
		var messageLength = length;

		var index = message.indexOf(headerTemplate["0.1"][2]);
		if (index < messageLength){
			return result;
		}

		var date = message.substring(messageLength, index);
		result.date = date;
		if (isNaN(date)){
			return result;
		}
		result.result = true;
		index = index + headerTemplate["0.1"][2].length;
		result.message = message.substring(index, message.length);
		result.message = result.message.trim();

		return result;
	};

	var checkHeader02 = function(message,length,result){
		var messageLength = length;

		var index = message.indexOf(headerTemplate["0.2"][2]);
		if (index < messageLength){
			return result;
		}

		var date = message.substring(messageLength, index);
		result.date = date;
		if (isNaN(date)){
			return result;
		}

		messageLength = index + headerTemplate["0.2"][2].length;
		index = message.indexOf(headerTemplate["0.2"][3]);
		var seed = message.substring(messageLength, index);
		result.seed = seed;
		if (isNaN(seed)){
			return result;
		}

		result.result = true;
		index = index + headerTemplate["0.2"][3].length;
		result.message = message.substring(index, message.length);
		result.message = result.message.trim();

		return result;
	};

	var headerTemplate = {};

	headerTemplate[0] = "Encrypted by VKEncrypt, version ";
	headerTemplate[1] = ", date ";
	headerTemplate["0.1"] = ["Encrypted by VKEncrypt, version ", ", date ", " : "];
	headerTemplate["0.2"] = ["Encrypted by VKEncrypt, version ", ", date ", ", seed ", " : "];

	var getHeader = function(){
		switch(configuration.version){
			case "0.1":
				return headerTemplate["0.1"][0] + "0.1" + headerTemplate["0.1"][1] + timeModule.getLastUnixtime() + headerTemplate["0.1"][2];
			case "0.2":
				return headerTemplate["0.2"][0] + "0.2" + headerTemplate["0.2"][1] + timeModule.getLastUnixtime() 
				+ headerTemplate["0.2"][2] + timeModule.getLastSeed() + headerTemplate["0.2"][3];
			case "0.3":
				return headerTemplate["0.2"][0] + "0.3" + headerTemplate["0.2"][1] + timeModule.getLastUnixtime() 
				+ headerTemplate["0.2"][2] + timeModule.getLastSeed() + headerTemplate["0.2"][3];
			case "0.4":
				return headerTemplate["0.2"][0] + "0.4" + headerTemplate["0.2"][1] + timeModule.getLastUnixtime() 
				+ headerTemplate["0.2"][2] + timeModule.getLastSeed() + headerTemplate["0.2"][3];
		}
	};

	this.addHeader = function(message){
		return getHeader() + message;
	};
	
	this.checkHeader = function(message){
		var result = getResultObject();
		var index = -1;

		if (message == null 
			|| message.length < getHeader().length
			|| (index = message.indexOf(headerTemplate[0])) != 0){
			return result;
		}

		index = message.indexOf(headerTemplate[1]);
		var version = message.substring(headerTemplate[0].length, index);

		result.version = version;
		if (configuration.allowedVersions.indexOf(version) == -1){
			return result;
		}

		var messageLength = index + headerTemplate[1].length;

		switch(version){
			case "0.1":
			return checkHeader01(message, messageLength, result);
			case "0.2":
			case "0.3":
			case "0.4":
			return checkHeader02(message, messageLength, result);
		}
	};

	return this;
}();